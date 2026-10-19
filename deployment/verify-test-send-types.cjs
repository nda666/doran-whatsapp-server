const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { createRequire } = require('node:module');
function load(relative, stubs = {}) {
  const file = path.resolve(__dirname, '..', relative);
  const realRequire = createRequire(file);
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name.startsWith('@/')) return load('src/' + name.slice(2) + '.ts', stubs);
    if (name.startsWith('.')) return load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(file), name)) + '.ts', stubs);
    return realRequire(name);
  }, module, module.exports);
  return module.exports;
}
const defaultExport = value => ({ __esModule: true, default: value });
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, setHeader() {} });
(async () => {
  const config = load('src/lib/testSend.ts');
  const content = load('src/server/campaigns/content.ts');
  class DispatchError extends Error { constructor(status, message) { super(message); this.status = status; } }
  let lookup, stored;
  let asset = { id: 'media', mime: 'image/png', userId: 'owner' };
  const tx = { $queryRaw: async () => [], waDispatch: { count: async () => 0, findMany: async () => stored }, waSenderLease: { createMany: async () => {} } };
  const db = { mediaAsset: { findFirst: async ({ where }) => { lookup = where; return asset && asset.userId === where.userId ? asset : null; } }, $transaction: async fn => fn(tx) };
  const helper = load('src/server/dispatch/testSend.ts', {
    '../../lib/prisma': { prisma: db }, './queue': { DispatchError, prepareDispatch: (_, __, body) => ({ jobs: [{ id: 'job', recipient: body.number, message: body.message }] }), dispatchResponse: (_, jobs) => ({ result: true, queued: true, data: jobs }) },
    '../dispatchWebhook/events': { createDispatches: async (_, { data }) => { stored = data; } },
  });
  const samples = {
    text: {}, image: {}, video: {}, audio: {}, document: {}, sticker: {},
    button: { text: 'test', buttons: [{ id: 'b1', text: 'Buka' }] },
    list: { text: 'test', title: 'Pilih', buttonText: 'Buka', rows: [{ id: 'r1', title: 'Satu' }] },
    poll: { name: 'Pilih', values: ['A', 'B'], selectableCount: 1 },
    location: { latitude: 0, longitude: 0, name: 'Lokasi test' },
    vcard: { name: 'Kontak test', number: '6281217357535' },
  };
  const mimes = { image: 'image/png', video: 'video/mp4', audio: 'audio/mpeg', document: 'application/pdf', sticker: 'image/webp' };
  for (const type of config.testSendTypes.map(option => option.value)) {
    const input = config.testSendRequest.parse({ number: '081217357535', type, message: 'test', mediaId: 'media', payload: samples[type] });
    if (mimes[type]) asset = { ...asset, mime: mimes[type] };
    const prepared = await helper.prepareTestContent(input, 'owner');
    if (mimes[type]) { assert.equal(prepared.mediaId, 'media'); assert.equal(lookup.userId, 'owner'); }
    if (type === 'sticker') assert.equal(prepared.payload.kind, 'sticker');
    if (!mimes[type] && type !== 'text') assert(content.payloadContent(prepared.payload));
    const queued = await helper.enqueueTestContent('phone', 'owner', '6281217357535', input, prepared);
    assert(queued.queued); assert.equal(stored[0].recipient, '6281217357535'); assert.equal(stored[0].mediaId, prepared.mediaId); assert.deepEqual(stored[0].payload, prepared.payload);
  }
  assert(!config.testSendRequest.safeParse({ number: '1,2', type: 'text' }).success);
  assert(!config.testSendRequest.safeParse({ number: '0812', type: 'unknown' }).success);
  const invalid = async (type, payload) => assert.rejects(helper.prepareTestContent(config.testSendRequest.parse({ number: '081217357535', type, payload }), 'owner'), error => error.status === 400);
  await invalid('text'); await invalid('location', { latitude: 91, longitude: 0 });
  await invalid('poll', { name: 'Pilih', values: ['A', 'A'], selectableCount: 1 });
  await invalid('poll', { name: 'Pilih', values: ['A', 'B'], selectableCount: 3 });
  await invalid('button', { text: 'test', buttons: [{ id: 'a', text: 'A' }, { id: 'a', text: 'B' }] });
  await invalid('list', { ...samples.list, rows: [] });
  await invalid('vcard', { name: 'test', number: 'abc' });
  asset = { id: 'media', userId: 'other', mime: 'image/png' };
  await assert.rejects(helper.prepareTestContent(config.testSendRequest.parse({ number: '081217357535', type: 'image', mediaId: 'media' }), 'owner'));
  asset = { ...asset, userId: 'owner' };
  await assert.rejects(helper.prepareTestContent(config.testSendRequest.parse({ number: '081217357535', type: 'sticker', mediaId: 'media' }), 'owner'));
  let phone = { id: 'phone', userId: 'owner', active: 1, isOnline: true }, sends = 0, queues = 0;
  const handler = load('src/pages/api/phones/[id]/test-send.ts', {
    '@/middleware/apiAuthMiddleware': defaultExport(fn => fn), '@/lib/access': { ownerScope: user => ({ userId: user.id }) },
    '@/lib/prisma': { prisma: { phone: { findFirst: async ({ where }) => { assert.equal(where.userId, 'owner'); return phone; } }, mediaAsset: { findMany: async ({ where }) => { assert.equal(where.userId, 'owner'); return []; } } } },
    '@/validations/sendMessage': { SendMessageValidation: async () => ({ result: true }) },
    '@/server/libs/sendMessageFromIo': defaultExport(async () => { sends++; return [{ key: { id: 'test-id' } }]; }),
    '@/server/dispatch/queue': { DispatchError, enqueueDispatch: async () => { queues++; return { result: true, queued: true }; } },
    '@/server/dispatch/testSend': { prepareTestContent: helper.prepareTestContent, enqueueTestContent: async (_, __, recipient) => { assert.equal(recipient, '6281217357535'); queues++; return { result: true, queued: true }; } },
  }).default;
  process.env.WHATSAPP_ENABLED = 'true'; process.env.DISPATCH_QUEUE_ENABLED = 'true';
  const req = { method: 'POST', user: { id: 'owner' }, query: { id: 'phone' }, body: { number: '081217357535', type: 'location', payload: samples.location } };
  let res = response(); await handler(req, res); assert.equal(res.code, 200); assert.equal(queues, 1); assert.equal(sends, 0);
  for (const body of [{ ...req.body, number: 'abc' }, { ...req.body, number: '0812,0813' }, { ...req.body, type: 'bad' }, { ...req.body, payload: { latitude: 91, longitude: 0 } }]) {
    res = response(); await handler({ ...req, body }, res); assert.equal(res.code, 400);
  }
  phone.isOnline = false; res = response(); await handler(req, res); assert.equal(res.code, 409); phone.isOnline = true;
  phone.active = 0; res = response(); await handler(req, res); assert.equal(res.code, 409); phone.active = 1;
  const owned = phone; phone = null; res = response(); await handler(req, res); assert.equal(res.code, 404); phone = owned;
  res = response(); await handler({ ...req, method: 'GET' }, res); assert.equal(res.code, 200); assert.deepEqual(res.body.data, []);
  process.env.DISPATCH_QUEUE_ENABLED = 'false'; res = response(); await handler(req, res); assert.equal(res.code, 503); assert.equal(sends, 0);
  res = response(); await handler({ ...req, body: { number: '081217357535', message: 'Backward compatible text' } }, res); assert.equal(res.code, 200); assert.equal(sends, 1);
  process.env.WHATSAPP_ENABLED = 'false'; res = response(); await handler(req, res); assert.equal(res.code, 503);
  console.log('TEST_SEND_11_TYPES_QUEUE_PAYLOAD_MEDIA_OWNERSHIP_VALIDATION_AND_LEGACY_TEXT_OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
