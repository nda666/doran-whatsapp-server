const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
function load(relative, stubs) {
  const file = path.resolve(__dirname, '../dist', relative);
  const realRequire = createRequire(file);
  const module = { exports: {} };
  new Function('require', 'module', 'exports', fs.readFileSync(file, 'utf8'))(
    name => Object.hasOwn(stubs, name) ? stubs[name] : realRequire(name), module, module.exports);
  return module.exports.default || module.exports;
}
const defaultExport = value => ({ __esModule: true, default: value });
function response() {
  return { code: 200, body: undefined, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, send(body) { this.body = body; }, setHeader() {} };
}
(async () => {
  process.env.WHATSAPP_ENABLED = 'true';
  process.env.DISPATCH_QUEUE_ENABLED = 'false';
  const previousPrisma = global.prisma;
  delete global.prisma;
  let clients = 0;
  const prismaStub = { PrismaClient: class { constructor() { clients++; } } };
  const first = load('src/lib/prisma.js', { '@prisma/client': prismaStub });
  const second = load('src/lib/prisma.js', { '@prisma/client': prismaStub });
  assert.equal(first.prisma, second.prisma); assert.equal(clients, 1);
  if (previousPrisma) global.prisma = previousPrisma; else delete global.prisma;
  console.log('PRISMA_SINGLE_POOL_ACROSS_MODULE_COPIES_OK');
  let sends = 0;
  let phone = { id: 'owned-device', userId: 'owner', active: 1, isOnline: true };
  const fakeSend = async () => { sends++; return [{ key: { id: 'fake-message-id' } }]; };
  const test = load('src/pages/api/phones/[id]/test-send.js', {
    '@/middleware/apiAuthMiddleware': defaultExport(fn => fn),
    '@/lib/prisma': { prisma: { phone: { findFirst: async ({ where }) => { assert.equal(where.userId, 'owner'); return phone; } } } },
    '@/server/libs/sendMessageFromIo': defaultExport(fakeSend),
    '@/server/dispatch/queue': {},
    '@/utils/normalizePhoneRecipient': load('src/utils/normalizePhoneRecipient.js', {}),
    '@/validations/sendMessage': { SendMessageValidation: async () => ({ result: true }) },
  });
  const req = { method: 'POST', user: { id: 'owner' }, query: { id: 'owned-device' }, body: { number: '6281217357535', message: 'mock test' } };
  let res = response(); await test(req, res); assert.equal(res.code, 200); assert.equal(res.body.messageId, 'fake-message-id'); assert.equal(sends, 1);
  phone = { ...phone, active: 0 }; res = response(); await test(req, res); assert.equal(res.code, 409); assert.equal(sends, 1);
  phone = { ...phone, active: 1, isOnline: false }; res = response(); await test(req, res); assert.equal(res.code, 409); assert.equal(sends, 1);
  phone = null; res = response(); await test(req, res); assert.equal(res.code, 404); assert.equal(sends, 1);
  phone = { id: 'owned-device', userId: 'owner', active: 1, isOnline: true };
  res = response(); await test({ ...req, body: { ...req.body, number: '6281217357535,6281217357535' } }, res); assert.equal(res.code, 400); assert.equal(sends, 1);
  console.log('TEST_SEND_ACTIVE_ONLINE_OWNER_SINGLE_RECIPIENT_OK');
  const normalize = load('src/utils/normalizePhoneRecipient.js', {}).normalizePhoneRecipient;
  for (const value of ['081217357535', '6281217357535', '+6281217357535', ' 0812-1735-7535 ', '+62 (812) 1735 7535']) assert.equal(normalize(value), '6281217357535');
  for (const value of ['abc081217357535', '0812,0813', '12', '08foo12']) assert.throws(() => normalize(value));
  console.log('LOCAL_INTERNATIONAL_FORMATS_NORMALIZED_INVALID_INPUT_REJECTED_OK');
  process.env.DISPATCH_QUEUE_ENABLED = 'true';
  const queuedTest = load('src/pages/api/phones/[id]/test-send.js', {
    '@/middleware/apiAuthMiddleware': defaultExport(fn => fn),
    '@/lib/prisma': { prisma: { phone: { findFirst: async () => phone } } },
    '@/server/libs/sendMessageFromIo': defaultExport(async () => { throw new Error('Direct send forbidden'); }),
    '@/server/dispatch/queue': { enqueueDispatch: async (_, __, body) => { assert.equal(body.number, '6281217357535'); return { result: true, queued: true }; } },
    '@/utils/normalizePhoneRecipient': { normalizePhoneRecipient: normalize },
    '@/validations/sendMessage': { SendMessageValidation: async () => ({ result: true }) },
  });
  for (const number of ['081217357535', '6281217357535', '+62 (812) 1735-7535']) {
    res = response(); await queuedTest({ ...req, body: { ...req.body, number } }, res); assert.equal(res.body.queued, true);
  }
  res = response(); await queuedTest({ ...req, body: { ...req.body, number: 'wrong-number' } }, res); assert.equal(res.code, 400);
  console.log('TEST_SEND_ENDPOINT_NORMALIZES_LOCAL_FORMAT_BEFORE_QUEUE_OK');
  process.env.DISPATCH_QUEUE_ENABLED = 'false';
  sends = 0;
  const external = load('src/pages/api/send-message.js', {
    '@/lib/prisma': { prisma: { phone: { findUnique: async ({ where }) => where.token === 'fake-device-token' ? phone : null } } },
    '@/server/libs/sendMessageFromIo': defaultExport(fakeSend),
    '@/server/dispatch/queue': {},
    '@/validations/sendMessage': { SendMessageValidation: async () => ({ result: true }) },
  });
  const body = { number: '6281217357535', message: 'mock test', api_key: 'fake-device-token', dry_run: true };
  res = response(); await external({ method: 'POST', body }, res); assert.equal(res.body.result, true); assert.equal(res.body.dry_run, true); assert.equal(sends, 0);
  res = response(); await external({ method: 'POST', body: { ...body, api_key: 'wrong-token' } }, res); assert.equal(res.body.result, false); assert.equal(sends, 0);
  res = response(); await external({ method: 'POST', body: { ...body, dry_run: false } }, res); assert.equal(res.body.result, true); assert.equal(sends, 1);
  console.log('EXTERNAL_DRY_RUN_NO_SEND_AND_EXISTING_CONTRACT_OK');
  let attempts = 0;
  let content;
  const socket = { sendMessage: async (jid, payload) => { attempts++; content = payload; if (attempts === 1) throw { output: { statusCode: 428 } }; return { key: { id: 'fake-message-id' } }; } };
  const sender = load('src/server/libs/sendMessageFromIo.js', {
    '@whiskeysockets/baileys': { delay: async () => {} },
    './makeWASocket': defaultExport(async () => socket),
  });
  const args = { phoneId: 'owned-device', userId: 'owner', tos: ['6281217357535'], phoneCountry: 'ID', message: 'mock test', image: 'https://example.com/test.png' };
  await sender(args); assert.equal(content.image.url, args.image); assert.equal(attempts, 2);
  attempts = 0; socket.sendMessage = async () => { attempts++; throw { output: { statusCode: 428 } }; };
  await assert.rejects(sender(args)); assert.equal(attempts, 5);
  socket.sendMessage = async () => undefined;
  await assert.rejects(sender(args), /ID pesan/);
  console.log('SEND_RETRY_MEDIA_PRESERVED_AND_FAILURE_NOT_SUCCESS_OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
