'use strict';
// Real database/transactions, synthetic IDs and mock WhatsApp transport only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { randomUUID } = require('node:crypto');
const app = path.resolve(__dirname, '..');
require('@next/env').loadEnvConfig(app, false);
const testDatabase = new URL(process.env.DATABASE_URL || 'mysql://invalid');
if (testDatabase.hostname !== '127.0.0.1' || testDatabase.port !== '33179' || !testDatabase.pathname.startsWith('/doran_upgrade_test')) {
  throw new Error('Dispatch database tests require disposable 127.0.0.1:33179/doran_upgrade_test*');
}
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const userId = randomUUID(), phoneId = randomUUID();
function load(relative, stubs) {
  const file = path.join(app, relative), real = createRequire(file), module = { exports: {} };
  const code = require('typescript').transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: 1, target: 7, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', code)(name => Object.hasOwn(stubs, name) ? stubs[name] : real(name), module, module.exports);
  return module.exports;
}
const dispatchEvents = load('src/server/dispatchWebhook/events.ts', { '../../lib/prisma': { prisma } });
const queue = load('src/server/dispatch/queue.ts', { '../../lib/prisma': { prisma }, '../dispatchWebhook/events': dispatchEvents });
const receipts = load('src/server/dispatch/receipts.ts', { '../../lib/prisma': { prisma }, '../dispatchWebhook/events': dispatchEvents });
let online = true, sends = 0, fail = false, mediaFail = false, missingAck = false, inFlight = 0, maxInFlight = 0;
const socket = { ws: { get isOpen() { return online; } }, user: { id: 'mock@s.whatsapp.net' },
  waitForMessage: async id => missingAck ? undefined : { tag: 'ack', attrs: { id } },
  async sendMessage(jid, content, options) {
    assert.match(jid, /@s.whatsapp.net$/); sends++; inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise(resolve => setTimeout(resolve, 20)); inFlight--;
    if (fail) throw new Error('MOCK_TRANSPORT_UNCERTAIN'); return { key: { id: options.messageId } };
  } };
const workerDb = new Proxy(prisma, { get(target, key) { return key === 'phone' ? { findUnique: async () => ({ id: phoneId, active: 1 }) } : Reflect.get(target, key); } });
const worker = load('src/server/dispatch/worker.ts', { '../dispatchWebhook/events': dispatchEvents,
  '../../lib/prisma': { prisma: workerDb }, '../libs/makeWASocket': { session: { get: () => socket } },
  '@whiskeysockets/baileys': { generateMessageIDV2: () => randomUUID() },
  './media': { loadDispatchImage: async () => { if (mediaFail) throw new Error('MOCK_MEDIA'); return Buffer.from('mock'); } },
  '../campaigns/media': require('../dist/src/server/campaigns/media'),
  '../campaigns/content': require('../dist/src/server/campaigns/content'),
});
const body = { transaction_id: 'duplicate', store_id: 'store-001', message: 'Synthetic queue test', number: '6281217357535,+6281217357535,6281317357535,6281417357535,6281517357535' };
const ready = async () => prisma.waSenderLease.update({ where: { phoneId }, data: { nextSendAt: new Date(0) } });
(async () => {
  assert.equal(queue.prepareDispatch(phoneId, userId, body).jobs.length, 4);
  assert.throws(() => queue.prepareDispatch(phoneId, userId, { ...body, number: 'invalid' }), /Nomor/);
  const results = await Promise.allSettled(Array.from({ length: 20 }, () => queue.enqueueDispatch(phoneId, userId, body)));
  assert(results.every(r => r.status === 'fulfilled' && r.value.data.length === 4));
  assert.equal(await prisma.waDispatch.count({ where: { userId } }), 4);
  await assert.rejects(queue.enqueueDispatch(phoneId, userId, { ...body, message: 'different' }), e => e.status === 409);
  await Promise.all([worker.processPhone(phoneId), worker.processPhone(phoneId)]);
  assert.equal(sends, 1); assert.equal(maxInFlight, 1);
  const sent = await prisma.waDispatch.findFirst({ where: { userId, status: 'SENT' } }); assert(sent);
  await receipts.recordDispatchReceipt(phoneId, sent.messageId, 4);
  await receipts.recordDispatchReceipt(phoneId, sent.messageId, 3);
  await receipts.recordDispatchReceipt(phoneId, sent.messageId, 2);
  assert.equal((await prisma.waDispatch.findUnique({ where: { id: sent.id } })).status, 'READ');
  await queue.enqueueDispatch(phoneId, userId, body); assert.equal(sends, 1);
  online = false; await ready(); await worker.processPhone(phoneId);
  assert.equal(sends, 1); assert.equal(await prisma.waDispatch.count({ where: { userId, status: 'QUEUED', attempts: 0 } }), 3);
  online = true; fail = true; await ready(); await prisma.waDispatch.updateMany({ where: { userId, status: 'QUEUED' }, data: { nextAttemptAt: new Date(0) } });
  await worker.processPhone(phoneId);
  const uncertain = await prisma.waDispatch.findFirst({ where: { userId, status: 'UNCERTAIN' } }); assert(uncertain); assert.equal(sends, 2);
  await receipts.recordDispatchReceipt(phoneId, uncertain.messageId, 3);
  assert.equal((await prisma.waDispatch.findUnique({ where: { id: uncertain.id } })).status, 'DELIVERED');
  const pending = await prisma.waDispatch.findFirst({ where: { userId, status: 'QUEUED' } });
  await prisma.waDispatch.update({ where: { id: pending.id }, data: { status: 'PROCESSING', leaseUntil: new Date(0) } });
  await worker.recoverDispatches();
  assert.equal((await prisma.waDispatch.findUnique({ where: { id: pending.id } })).status, 'UNCERTAIN');
  const expiring = await prisma.waDispatch.findFirst({ where: { userId, status: 'QUEUED' } });
  await prisma.waDispatch.update({ where: { id: expiring.id }, data: { expiresAt: new Date(0) } }); await worker.recoverDispatches();
  assert.equal((await prisma.waDispatch.findUnique({ where: { id: expiring.id } })).status, 'FAILED');
  console.log('CONCURRENT_DEDUPE_RECIPIENT_STATUS_SENDER_LEASE_OFFLINE_CRASH_RECEIPTS_OK');
  const started = Date.now(); let next = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (next < 175) { const index = next++; await queue.enqueueDispatch(phoneId, userId, { ...body, store_id: `burst-${index}`, transaction_id: 'burst' }); }
  }));
  assert.equal(await prisma.waDispatch.count({ where: { userId, transactionId: 'burst' } }), 700);
  console.log(JSON.stringify({ test: '175_STORES_700_RECIPIENTS_PERSISTED', elapsed_ms: Date.now() - started, real_whatsapp_messages: 0 }));
  // Unique keys remain distinct for store and message type.
  await queue.enqueueDispatch(phoneId, userId, { ...body, message_key: 'another', message: 'another type' });
  assert.equal(await prisma.waDispatch.count({ where: { userId, transactionId: 'duplicate' } }), 8);
  fail = false; missingAck = true; await ready(); await worker.processPhone(phoneId);
  assert.equal(await prisma.waDispatch.count({ where: { userId, status: 'UNCERTAIN' } }), 2);
  missingAck = false;
  const media = load('src/server/dispatch/media.ts', { '../utils/safeLinkPreview': { isPublicAddress: ip => !ip.startsWith('127.') && !ip.startsWith('10.') } });
  await assert.rejects(media.loadDispatchImage('http://127.0.0.1/image.png'), /PRIVATE/);
  await assert.rejects(media.loadDispatchImage('%%%'), /BASE64/);
  console.log('STORE_MESSAGE_KEY_SCOPE_AND_PRIVATE_MEDIA_BLOCKED_OK');
  const racing = await Promise.allSettled([
    queue.enqueueDispatch(phoneId, userId, { ...body, transaction_id: 'race-conflict' }),
    queue.enqueueDispatch(phoneId, userId, { ...body, transaction_id: 'race-conflict', message: 'conflicting content' }),
  ]);
  assert.equal(racing.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(racing.find(r => r.status === 'rejected').reason.status, 409);
  assert.equal(await prisma.waDispatch.count({ where: { userId, transactionId: 'race-conflict' } }), 4);
  process.env.DISPATCH_QUEUE_ENABLED = 'true';
  const fakePhone = { id: phoneId, userId, active: 1, isOnline: false };
  const apiDb = new Proxy(prisma, { get(target, key) { return key === 'phone' ? {
    findUnique: async ({ where }) => where.token === 'test-token' ? fakePhone : where.token === 'other-token' ? { ...fakePhone, id: randomUUID() } : null,
  } : Reflect.get(target, key); } });
  const apiStubs = { '@/server/dispatchWebhook/events': dispatchEvents, '@/lib/prisma': { prisma: apiDb }, '@/server/dispatch/queue': queue,
    '@/server/dispatchAuth': load('src/server/dispatchAuth.ts', { '@/lib/prisma': { prisma: apiDb }, '@/lib/access': load('src/lib/access.ts', {}) }),
    '@/server/deviceToken': load('src/server/deviceToken.ts', {}),
    '@/server/libs/sendMessageFromIo': { __esModule: true, default: async () => { throw new Error('REAL_TRANSPORT_FORBIDDEN'); } },
    '@/validations/sendMessage': { SendMessageValidation: async () => ({ result: true }) } };
  const external = load('src/pages/api/send-message.ts', apiStubs).default;
  const statusApi = load('src/pages/api/send-status.ts', apiStubs).default;
  const response = () => ({ code: 200, body: null, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, send() {} });
  let res = response(); await external({ method: 'POST', headers: {}, body: { ...body, api_key: 'test-token', dry_run: true } }, res);
  assert.equal(res.body.dry_run, true); assert.equal(res.body.queue_enabled, true);
  res = response(); await external({ method: 'POST', headers: {}, body: { ...body, transaction_id: 'api-test', api_key: 'test-token' } }, res);
  assert.equal(res.body.queued, true); assert.equal(res.body.data.length, 4);
  res = response(); await external({ method: 'POST', headers: {}, body: { ...body, number: 'bad', api_key: 'test-token' } }, res); assert.equal(res.code, 400);
  res = response(); await statusApi({ method: 'POST', headers: {}, body: { api_key: 'test-token', transaction_id: 'api-test', store_id: body.store_id } }, res);
  assert.equal(res.body.total, 4);
  const ownedJobId = res.body.data[0].id;
  res = response(); await statusApi({ method: 'GET', headers: { authorization: 'Bearer other-token' }, query: { id: ownedJobId } }, res); assert.equal(res.body.total, 0);
  res = response(); await statusApi({ method: 'GET', headers: {}, query: { api_key: 'test-token', id: ownedJobId } }, res); assert.equal(res.body.total, 1);
  res = response(); await statusApi({ method: 'GET', headers: {}, query: { id: ownedJobId } }, res); assert.equal(res.code, 401);
  console.log('CONCURRENT_CONFLICT_ROLLBACK_PUBLIC_API_QUEUE_STATUS_AUTH_SCOPE_OK');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  await prisma.waDispatch.deleteMany({ where: { userId, phoneId } });
  await prisma.waSenderLease.deleteMany({ where: { phoneId } });
  await prisma.$disconnect();
});
