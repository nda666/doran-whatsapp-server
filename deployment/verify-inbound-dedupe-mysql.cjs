'use strict';
// Explicit integration check against an isolated test schema; never infer DATABASE_URL from .env.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const url = new URL(process.env.DATABASE_URL || 'invalid:');
assert(url.protocol === 'mysql:' && ['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname === '/wa_inbound_ci', 'Isolated wa_inbound_ci database required');
const { PrismaClient } = require('@prisma/client');
const { claimIncoming, claimLiveIncoming } = require('../src/server/messaging/incomingDedupe.ts');
const { captureStop } = require('../src/server/messaging/safety.ts');
const { prisma } = require('../src/lib/prisma.ts');
const other = new PrismaClient();
const phoneId = randomUUID(), userId = randomUUID(), number = '6281234567890';
const key = { id: randomUUID(), remoteJid: `${number}@s.whatsapp.net` };
(async () => {
  const results = await Promise.all(Array.from({ length: 24 }, (_, i) => claimIncoming(phoneId, key, 'LIVE', i % 2 ? other : prisma)));
  assert.equal(results.filter(Boolean).length, 1, 'Unique DB key serializes two clients');
  await other.$disconnect();
  const restarted = new PrismaClient();
  try { assert.equal(await claimIncoming(phoneId, key, 'LIVE', restarted), false, 'New DB connection retains dedupe'); }
  finally { await restarted.$disconnect(); }
  const history = { ...key, id: randomUUID() };
  assert.equal(await claimLiveIncoming(phoneId, history, 'append'), false);
  assert.equal(await claimLiveIncoming(phoneId, history, 'notify'), true);
  const rollback = { ...key, id: randomUUID() };
  await assert.rejects(prisma.$transaction(async tx => { assert.equal(await claimIncoming(phoneId, rollback, 'STOP', tx), true); throw Error('ROLLBACK'); }), /ROLLBACK/);
  assert.equal(await claimIncoming(phoneId, rollback, 'STOP'), true, 'Rollback does not burn STOP claim');
  await prisma.user.create({ data: { id: userId, name: 'Isolated dedupe test', email: `${userId}@example.invalid`, password: 'test-no-login', token: randomUUID() } });
  await prisma.phone.create({ data: { id: phoneId, userId, name: 'Isolated fixture' } });
  await prisma.recipientConsent.create({ data: { userId, number, purpose: 'SUPPORT', source: 'fixture', evidence: 'fixture', grantedAt: new Date() } });
  const stop = { ...key, id: randomUUID() };
  assert.equal(await captureStop(userId, key.remoteJid, 'STOP', { phoneId, key: stop }), true);
  const suppression = await prisma.recipientSuppression.findUniqueOrThrow({ where: { userId_number: { userId, number } } });
  assert.equal(await captureStop(userId, key.remoteJid, 'STOP', { phoneId, key: stop }), true);
  assert.equal(await prisma.recipientConsentEvent.count({ where: { userId, number } }), 1, 'STOP replay does not repeat revocation');
  assert.equal((await prisma.recipientSuppression.findUniqueOrThrow({ where: { userId_number: { userId, number } } })).createdAt.getTime(), suppression.createdAt.getTime());
  assert((await prisma.recipientConsent.findFirstOrThrow({ where: { userId, number } })).revokedAt);
  console.log('INBOUND_DEDUPE_MYSQL_OK');
})().finally(async () => {
  await prisma.waIncomingEffect.deleteMany({ where: { phoneId } });
  await prisma.recipientConsentEvent.deleteMany({ where: { userId } });
  await prisma.recipientConsent.deleteMany({ where: { userId } });
  await prisma.recipientSuppression.deleteMany({ where: { userId } });
  await prisma.phone.deleteMany({ where: { id: phoneId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  await Promise.all([prisma.$disconnect(), other.$disconnect()]);
}).catch(error => { console.error(error); process.exitCode = 1; });
