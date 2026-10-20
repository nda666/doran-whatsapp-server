const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { createRequire } = require('node:module');
const { EventEmitter } = require('node:events');
function load(relative, stubs = {}) {
  const filename = path.resolve(__dirname, '..', relative), module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const real = createRequire(filename);
  new Function('require', 'module', 'exports', source)(name => Object.hasOwn(stubs, name) ? stubs[name] : real(name), module, module.exports);
  return module.exports;
}
const helpers = load('src/server/deviceWebhook/events.ts');
const access = load('src/lib/access.ts');
const initialPhone = { id: '11111111-1111-4111-8111-111111111111', userId: 'owner', name: 'Old', number: '62810000000', active: 1, token: 'old-token', account_name: 'WA', qrCode: 'must-never-leak', readReceipt: false, rejectCall: false, showOnline: true, showTyping: false, is_save_group: false, webhookUrl: null };
let config, phone, jobs, requests, failDelivery;
const matches = (row, where) => Object.entries(where).every(([key, value]) => {
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    if (value.in) return value.in.includes(row[key]);
    if (value.notIn) return !value.notIn.includes(row[key]);
    if (value.lt) return row[key] < value.lt;
  }
  return row[key] === value;
});
function reset() {
  config = { id: 1, enabled: true, revision: 'revision-1', url: 'https://cashier.example.com/hook', secret: 'test-secret-1234567890' };
  phone = { ...initialPhone }; jobs = []; requests = []; failDelivery = false;
}
const tx = {
  $queryRaw: async () => [],
  phone: {
    findFirst: async ({ where }) => phone && matches(phone, where) ? { ...phone } : null,
    findUniqueOrThrow: async () => ({ ...phone }),
    updateMany: async ({ data }) => { Object.assign(phone, data); return { count: 1 }; },
  },
  user: { findUnique: async () => ({ id: 'owner', name: 'Owner', email: 'owner@example.com' }) },
  deviceWebhookSetting: {
    findUnique: async () => config && { ...config },
    upsert: async ({ update, create }) => { config = config ? { ...config, ...update } : { ...create }; return config; },
  },
  deviceWebhookEvent: {
    create: async ({ data }) => { const job = { id: jobs.length + 1, status: 'PENDING', attempts: 0, nextAttemptAt: new Date(), createdAt: new Date(), ...data }; jobs.push(job); return job; },
    findFirst: async ({ where }) => { const row = jobs.find(row => matches(row, where)); return row ? { ...row } : null; },
    findMany: async ({ select }) => jobs.map(row => Object.fromEntries(Object.keys(select).map(key => [key, row[key]]))),
    update: async ({ where, data }) => { const row = jobs.find(row => matches(row, where)); assert(row); for (const [key, value] of Object.entries(data)) row[key] = value?.increment ? row[key] + value.increment : value; return row; },
    updateMany: async ({ where, data }) => { const found = jobs.filter(row => matches(row, where)); found.forEach(row => Object.assign(row, data)); return { count: found.length }; },
  },
};
const db = { ...tx, $transaction: async fn => {
  const oldPhone = phone && { ...phone }, oldJobs = structuredClone(jobs), oldConfig = config && { ...config };
  try { return await fn(tx); } catch (error) { phone = oldPhone; jobs = oldJobs; config = oldConfig; throw error; }
} };
const worker = load('src/server/deviceWebhook/worker.ts', {
  '../utils/webhookWorkerRetry': load('src/server/utils/webhookWorkerRetry.ts'),
  '../../lib/prisma': { prisma: db }, '../utils/sendDeviceWebhook': { sendDeviceWebhook: async (url, body, headers) => { requests.push({ url, body, headers }); if (failDelivery) throw new Error('down'); } },
});
const settingsHandler = load('src/pages/api/admin/device-webhook.ts', {
  '@/lib/prisma': { prisma: db }, '@/lib/access': access, '@/server/deviceWebhook/events': helpers,
  '@/middleware/apiSuperAdminMiddleware': { __esModule: true, default: fn => fn },
}).default;
async function api(body, method = 'POST', user = { id: 'admin', role: 'ADMIN', email: 'admin@gmail.com', approvalStatus: 'APPROVED' }) {
  const res = { code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, end() { return this; } };
  await settingsHandler({ body, method, user }, res); return res;
}
(async () => {
  reset(); config.enabled = false; await helpers.enqueueDeviceEvent(tx, 'device.created', phone); assert.equal(jobs.length, 0);
  reset(); await helpers.enqueueDeviceEvent(tx, 'device.created', phone); let payload = JSON.parse(jobs[0].payload); assert.equal(payload.device.token, 'old-token'); assert.equal(payload.owner.id, 'owner'); assert(!JSON.stringify(payload).includes('must-never-leak'));
  reset(); await helpers.updateDevice(tx, { id: phone.id, userId: 'owner' }, { name: 'New' }); assert.equal(jobs.length, 1); assert.deepEqual(JSON.parse(jobs[0].payload).changed_fields, ['name']);
  await helpers.updateDevice(tx, { id: phone.id }, { name: 'New' }); assert.equal(jobs.length, 1, 'No event for identical values');
  await helpers.updateDevice(tx, { id: phone.id, userId: 'someone-else' }, { name: 'Unauthorized' }); assert.equal(phone.name, 'New'); assert.equal(jobs.length, 1);
  await helpers.updateDevice(tx, { id: phone.id }, { token: 'new-token' }, 'device.token_rotated'); assert.equal(JSON.parse(jobs[1].payload).device.token, 'new-token');
  reset(); const create = tx.deviceWebhookEvent.create; tx.deviceWebhookEvent.create = async () => { throw new Error('outbox unavailable'); };
  await assert.rejects(db.$transaction(tx => helpers.updateDevice(tx, { id: phone.id }, { token: 'should-rollback' })), /outbox unavailable/);
  assert.equal(phone.token, 'old-token'); tx.deviceWebhookEvent.create = create;
  reset(); await helpers.enqueueDeviceEvent(tx, 'device.updated', phone); await helpers.enqueueDeviceEvent(tx, 'device.deleted', phone);
  failDelivery = true; await worker.processDeviceWebhook(); assert.equal(jobs[0].status, 'PENDING'); assert.equal(jobs[0].attempts, 1);
  assert.equal(await worker.processDeviceWebhook(), false); assert.equal(requests.length, 1, 'FIFO blocks newer events during backoff');
  const eventId = requests[0].body.event_id; failDelivery = false; jobs[0].nextAttemptAt = new Date(0); await worker.processDeviceWebhook();
  assert.equal(requests[1].body.event_id, eventId); assert.equal(requests[1].headers.Authorization, 'Bearer ' + config.secret);
  assert.equal(requests[1].body.sequence, 1); assert.equal(jobs[0].status, 'DELIVERED'); assert.equal(jobs[0].payload, null);
  await worker.processDeviceWebhook(); assert.equal(jobs[1].status, 'DELIVERED');
  reset(); await helpers.enqueueDeviceEvent(tx, 'device.updated', phone); jobs[0].status = 'SENDING'; jobs[0].leaseUntil = new Date(Date.now() + 60000);
  assert.equal(await worker.processDeviceWebhook(), false); jobs[0].leaseUntil = new Date(0); await worker.processDeviceWebhook(); assert.equal(jobs[0].status, 'DELIVERED');
  reset(); await helpers.enqueueDeviceEvent(tx, 'device.updated', phone); jobs[0].attempts = 8; await worker.processDeviceWebhook(); assert.equal(jobs[0].status, 'FAILED'); assert.equal(requests.length, 0); assert.equal(jobs[0].payload, null);
  reset(); await helpers.enqueueDeviceEvent(tx, 'device.updated', phone); config.revision = 'different'; await worker.processDeviceWebhook(); assert.equal(jobs[0].status, 'CANCELLED'); assert.equal(requests.length, 0);
  reset(); let res = await api({}, 'GET'); assert(res.body.settings.secretConfigured); assert(!JSON.stringify(res.body).includes(config.secret));
  assert.equal((await api({}, 'GET', { id: 'other', role: 'ADMIN', email: 'other@example.com', approvalStatus: 'APPROVED' })).code, 403);
  assert.equal((await api({ enabled: true, url: 'http://cashier.example.com/hook' })).code, 400);
  assert.equal((await api({ enabled: true, url: 'https://name:password@example.com' })).code, 400);
  assert.equal((await api({ enabled: true, url: config.url, secret: 'short' })).code, 400);
  await helpers.enqueueDeviceEvent(tx, 'device.updated', phone); res = await api({ enabled: true, url: config.url }); assert.equal(res.code, 200); assert.equal(jobs[0].status, 'PENDING');
  res = await api({ enabled: false, url: config.url }); assert.equal(res.code, 200); assert.equal(jobs[0].status, 'CANCELLED'); assert.equal(jobs[0].payload, null);
  assert.equal((await api({ action: 'test' })).code, 409);
  reset(); assert.equal((await api({ action: 'test' })).code, 202); assert.equal(jobs[0].event, 'device.webhook.test'); assert.equal(JSON.parse(jobs[0].payload).device, null); assert.equal(phone.token, 'old-token');
  assert.equal((await api({}, 'DELETE')).code, 405);
  // Native HTTP adapter test: no socket/network is opened.
  let addresses = [{ address: '8.8.8.8', family: 4 }], httpCode = 204, httpRequests = 0;
  const fakeHttp = { request(url, options, callback) {
    httpRequests++;
    assert.equal(options.headers.Authorization, 'Bearer test-key');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert.equal(options.headers.Accept, 'application/json');
    assert.equal(options.headers.Authorization, 'Bearer test-key');
    options.lookup(url.hostname, {}, (_error, address) => assert.equal(address, '8.8.8.8'));
    const request = new EventEmitter();
    request.destroy = error => { request.emit('error', error); request.emit('close'); };
    request.end = bytes => {
      assert.equal(JSON.parse(bytes).event, 'device.updated');
      const response = new EventEmitter(); response.statusCode = httpCode;
      queueMicrotask(() => { callback(response); response.emit('data', Buffer.from('{"result":')); response.emit('data', Buffer.from('true}')); response.emit('end'); request.emit('close'); });
    };
    return request;
  } };
  const transport = load('src/server/utils/sendDeviceWebhook.ts', {
    'node:dns/promises': { lookup: async () => addresses }, 'node:http': fakeHttp, 'node:https': fakeHttp,
    './safeLinkPreview': { isPublicAddress: address => address === '8.8.8.8' },
  }).sendDeviceWebhook;
  await transport('https://cashier.example.com/hook', { event: 'device.updated' }, { Authorization: 'Bearer test-key' });
  let captured;
  httpCode = 302; await assert.rejects(transport('https://cashier.example.com/hook', { event: 'device.updated' }, { Authorization: 'Bearer test-key' }, response => { captured = response; }), /WEBHOOK_HTTP_ERROR/);
  assert.deepEqual(captured, { status: 302, body: '{"result":true}' }, 'Capture full HTTP response even for non-2xx');
  assert.equal(httpRequests, 2, 'Redirect must not be followed');
  addresses = [{ address: '127.0.0.1', family: 4 }];
  await assert.rejects(transport('https://cashier.example.com/hook', {}), /PRIVATE_WEBHOOK_ADDRESS/);
  addresses = [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }];
  await assert.rejects(transport('https://cashier.example.com/hook', {}), /PRIVATE_WEBHOOK_ADDRESS/);
  await assert.rejects(transport('https://user:pass@cashier.example.com/hook', {}), /INVALID_WEBHOOK_URL/);
  assert.equal(httpRequests, 2);
  console.log('DEVICE_WEBHOOK_OK: events, access, no-op suppression, atomic rollback, FIFO, retry/idempotency, lease recovery, exhaustion, cancellation, masked keys and test events; no network requests');
})().catch(error => { console.error(error); process.exitCode = 1; });
