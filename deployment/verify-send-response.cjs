'use strict';
// In-memory database and forbidden transport: no real messages or database writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
function load(relative, stubs) {
  const file = path.resolve(__dirname, '..', relative), real = createRequire(file), module = { exports: {} };
  const code = require('typescript').transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: 1, target: 7, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', code)(name => Object.hasOwn(stubs, name) ? stubs[name] : real(name), module, module.exports);
  return module.exports;
}
const job = { id: 'job-001', recipient: '6281217357535', status: 'QUEUED', messageId: null, attempts: 0,
  lastError: null, createdAt: new Date('2026-10-11T03:00:00Z'), sentAt: null, deliveredAt: null, readAt: null };
const prisma = { dispatchWebhookSetting: {findUnique: async () => null}, phone: { findUnique: async () => ({ id: 'phone', userId: 'user', active: 1 }) },
  waDispatch: { count: async () => 0, findMany: async () => [], createMany: async () => {} },
  waSenderLease: { createMany: async () => {} }, $queryRaw: async () => [] };
prisma.$transaction = async fn => {
  let inserted = false;
  const tx = { ...prisma, waDispatch: { ...prisma.waDispatch,
    createMany: async ({ data }) => { inserted = true; job.payloadHash = data[0].payloadHash; },
    findMany: async () => inserted ? [job] : [] } };
  return fn(tx);
};
const dispatchEvents = load('src/server/dispatchWebhook/events.ts', { '../../lib/prisma': { prisma } });
const queue = load('src/server/dispatch/queue.ts', { '../../lib/prisma': { prisma }, '../dispatchWebhook/events': dispatchEvents });
const tokenHelper = load('src/server/deviceToken.ts', {});
prisma.user = { findUnique: async ({ where }) => where.id ? { id: where.id, isActive: true, approvalStatus: 'APPROVED' } : null };
const dispatchAuth = load('src/server/dispatchAuth.ts', { '@/lib/prisma': { prisma }, '@/lib/access': { isApproved: user => user.approvalStatus === 'APPROVED' && user.isActive !== false } });
const forbidden = () => { throw new Error('REAL_TRANSPORT_FORBIDDEN'); };
const stubs = { '@/server/dispatchWebhook/events': dispatchEvents, '@/lib/prisma': { prisma }, '@/server/dispatch/queue': queue,
  '@/server/deviceToken': tokenHelper,
  '@/server/dispatchAuth': dispatchAuth,
  '@/server/libs/sendMessageFromIo': { __esModule: true, default: forbidden },
  '@/validations/sendMessage': {}, '@/server/campaigns/content': {},
  '@/utils/normalizePhoneRecipient': {}, '@/server/libs/makeWASocket': {},
  '@/server/libs/qrState': {}, '@/server/libs/pairingState': {},
  '@/server/registeredPhones': {}, '@/server/deviceWebhook/events': {} };
const legacy = load('src/pages/api/send-message.ts', stubs).default;
const publicApi = load('src/pages/api/public/[action].ts', stubs).default;
const publicMessage = load('src/pages/api/public/send-message.ts', { '../send-message': { __esModule: true, default: legacy } }).default;
assert.equal(publicMessage, legacy);
const response = () => ({ code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
process.env.DISPATCH_QUEUE_ENABLED = 'true';
process.env.WHATSAPP_ENABLED = 'true'; // All transport dependencies above are mocks.
(async () => {
  for (const identifiers of [{ transaction_id: 'ORDER-001', store_id: 'STORE-001', message_key: 'send-message' }, {}]) {
    const body = { number: job.recipient, message: 'Synthetic response test', api_key: 'test-token', ...identifiers };
    const a = response(), b = response();
    await legacy({ method: 'POST', headers: {}, body }, a);
    await publicApi({ method: 'POST', query: { action: 'send-message' }, headers: {}, body }, b);
    assert.equal(a.code, 200); assert.equal(b.code, 202);
    if (!body.transaction_id) { assert(a.body.transaction_id); assert(b.body.transaction_id); b.body.transaction_id = a.body.transaction_id; }
    assert.deepEqual(b.body, a.body);
    assert.equal(b.body.deduplication_enabled, !!body.transaction_id);
    assert.equal(b.body.store_id, body.store_id || 'default');
    assert.equal(b.body.message_key, body.message_key || 'default');
    assert.equal(b.body.data.length, 1);
  }
  for (const method of ['GET', 'POST']) {
    for (const auth of ['bearer', 'body', 'query']) {
      if (method === 'GET' && auth === 'body') continue;
      const input = { number: job.recipient, message: 'Synthetic', transaction_id: 'AUTH-001' };
      const req = { method, headers: {}, query: method === 'GET' ? { ...input } : {}, body: method === 'POST' ? { ...input } : undefined };
      if (auth === 'bearer') req.headers.authorization = 'Bearer test-token';
      if (auth === 'body') req.body.api_key = 'test-token';
      if (auth === 'query') req.query.api_key = 'test-token';
      const res = response(); await publicMessage(req, res);
      assert.equal(res.body.result, true);
      assert.equal(req.body.api_key, 'test-token');
    }
  }
  assert.equal(tokenHelper.deviceToken({ headers: { authorization: 'Bearer header-token' }, query: { api_key: 'query-token' } }, { api_key: 'body-token' }), 'header-token');
  assert.equal(tokenHelper.deviceToken({ headers: {}, query: { api_key: ['a', 'b'] } }), undefined);
  for (const action of ['send-media','send-poll','send-sticker','send-button','send-list','send-location','send-vcard','session','disconnect','check-number','generate-qr','list-phones','phone-detail']) {
    const alias = load(`src/pages/api/${action}.ts`, { './public/[action]': { __esModule: true, default: req => req.query.action } }).default;
    assert.equal(alias({ query: { action: 'disconnect' } }, {}), action);
  }
  for (const action of ['send-status', 'send-group-message', 'send-attachment']) {
    const sentinel = () => {};
    assert.equal(load(`src/pages/api/public/${action}.ts`, { [`../${action}`]: { __esModule: true, default: sentinel } }).default, sentinel);
  }
  assert.equal(load('src/pages/api/public/send-attachment.ts', { '../send-attachment': { __esModule: true, default: legacy } }).config.api.bodyParser, false);
  assert.equal(load('src/pages/api/public/v2/send-message.ts', { '../../send-message': { __esModule: true, default: legacy } }).default, legacy);
  for (const body of [{ api_key: 'test-token', number: 'bad', message: 'Synthetic' }, { api_key: 'test-token', number: job.recipient, message: 'Synthetic', dry_run: true }, {}]) {
    const a = response(), b = response();
    await legacy({ method: 'POST', headers: {}, body: { ...body } }, a);
    await publicMessage({ method: 'POST', headers: {}, body: { ...body } }, b);
    assert.equal(a.code, b.code); assert.deepEqual(a.body, b.body);
    if (a.body.result === false) assert.equal(a.body.curl_error, null);
  }
  const invalidPublic = response();
  await publicApi({ method: 'POST', query: { action: 'send-media' }, headers: {}, body: {} }, invalidPublic);
  assert.equal(invalidPublic.code, 401);
  assert.equal(invalidPublic.body.result, false);
  assert.equal(invalidPublic.body.curl_error, null);
  const statusApi = load('src/pages/api/send-status.ts', stubs).default;
  for (const method of ['GET', 'POST']) {
    const input = { api_key: 'test-token', id: 'job-001' }, res = response();
    await statusApi({ method, headers: {}, query: method === 'GET' ? input : {}, body: method === 'POST' ? input : {} }, res);
    assert.equal(res.body.result, true);
  }
  let parsedToken;
  const attachment = load('src/pages/api/send-attachment.ts', {
    ...stubs,
    formidable: { IncomingForm: class { parse(req, callback) { callback(null, { number: [job.recipient] }, {}); } } },
    '@/validations/sendAttachment': { SendAttachmentValidation: async input => { parsedToken = input.api_key; return { result: false, error: { result: false } }; } },
    '@/server/libs/sendAttachmentMessageIo': { __esModule: true, default: forbidden },
  }).default;
  await attachment({ method: 'POST', headers: { authorization: 'Bearer attachment-token' }, query: {} }, response());
  assert.equal(parsedToken, 'attachment-token');
  await attachment({ method: 'POST', headers: {}, query: { api_key: 'query-token' } }, response());
  assert.equal(parsedToken, 'query-token');
  console.log('SEND_RESPONSE_PARITY_OK: explicit IDs and generated defaults; no real messages or database writes');
})().catch(error => { console.error(error); process.exitCode = 1; });
