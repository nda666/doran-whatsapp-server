const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { createRequire } = require('node:module');
function load(relative, stubs = {}) {
  const file = path.resolve(__dirname, '..', relative), module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const real = createRequire(file);
  new Function('require', 'module', 'exports', source)(name => Object.hasOwn(stubs, name) ? stubs[name] : real(name), module, module.exports);
  return module.exports;
}
const endpoint = 'https://kasir.doran.id/api/webhooks/jeblast/dispatch-status';
const statuses = ['QUEUED','PROCESSING','SENT','DELIVERED','READ','FAILED','UNCERTAIN'];
const job = { id: '11111111-1111-4111-8111-111111111111', clientJobId: 'kasir-job-1', phoneId: 'device-1', userId: 'owner', storeId: 'store-1', transactionId: 'trx-1', messageKey: 'struk', recipient: '6281234567890', status: 'SENT', attempts: 1, messageId: 'wa-1', createdAt: new Date(), updatedAt: new Date(), sentAt: new Date(), message: 'PRIVATE', image: 'PRIVATE' };
let events = [], calls = [], missing = false, fail = false;
let config = { url: endpoint, secret: '', revision: 'revision-1', enabled: false };
let device = { url: 'https://kasir.doran.id/api/webhooks/jeblast/wa-phone', secret: 'existing-test-secret' };
const db = {
  waDispatch: { findUnique: async () => missing ? null : { ...job } },
  dispatchWebhookSetting: { findUnique: async () => config },
  deviceWebhookSetting: { findUnique: async () => device },
  dispatchWebhookEvent: {
    create: async ({data}) => { const event = { id: events.length + 100, ...data }; events.push(event); return { ...event }; },
    updateMany: async ({where, data}) => { const event = events.find(row => row.id === where.id && row.status === where.status); if(event) Object.assign(event, data); return { count: event ? 1 : 0 }; },
  },
};
const access = load('src/lib/access.ts');
const snapshots = load('src/server/dispatchWebhook/events.ts', { '../../lib/prisma': { prisma: db } });
const handler = load('src/pages/api/dispatch-webhook.ts', {
  '@/lib/prisma': { prisma: db }, '@/lib/access': access,
  '@/server/dispatchWebhook/events': snapshots,
  '@/middleware/apiAuthMiddleware': { __esModule: true, default: fn => fn },
  '@/server/utils/sendDeviceWebhook': { sendDeviceWebhook: async (url, payload, headers, onResponse) => { calls.push({ url, payload, headers }); onResponse?.({status:fail ? 422 : 200, body:JSON.stringify({result:!fail, echo:headers.Authorization.slice(7)})}); if(fail) throw new Error('http-error'); } },
}).default;
const admin = { id: 'admin', email: 'admin@gmail.com', role: 'ADMIN', approvalStatus: 'APPROVED' };
async function api(body, user = admin, method = 'POST') {
  const res = { code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, end() { return this; } };
  await handler({ body, user, method }, res); return res;
}
(async () => {
  const original = JSON.stringify(job);
  const preview = await api({ id: job.id, status: 'READ', action: 'preview' });
  assert.equal(preview.code, 200); assert.equal(preview.body.details.mode, 'preview');
  assert.equal(preview.body.details.request.body.dispatch.status, 'READ');
  assert.equal(preview.body.details.response, null); assert.equal(preview.body.details.request.body.sequence, null);
  assert.equal(preview.body.details.request.headers.Authorization, 'Bearer existing-test-secret');
  assert.equal(calls.length, 0); assert.equal(events.length, 0, 'Preview creates no events or network requests');
  for (const status of statuses) {
    const response = await api({ id: job.id, status }); assert.equal(response.code, 200);
    const call = calls.at(-1), event = events.at(-1);
    assert.equal(call.url, endpoint); assert.equal(call.headers.Authorization, 'Bearer existing-test-secret');
    assert.equal(call.payload.dispatch.id, job.id); assert.equal(call.payload.dispatch.job_id, job.clientJobId);
    assert.equal(call.payload.dispatch.transaction_id, job.transactionId); assert.equal(call.payload.dispatch.status, status);
    assert.equal(call.payload.sequence, event.id); assert.equal(call.payload.event_id, event.eventId);
    assert.equal(call.payload.previous_status, job.status); assert.equal(event.status, 'DELIVERED');
    assert.equal(event.payload, null); assert(!JSON.stringify(call.payload).includes('PRIVATE'));
    assert.equal(Boolean(call.payload.dispatch.read_at), status === 'READ');
    assert.equal(Boolean(call.payload.dispatch.delivered_at), ['DELIVERED','READ'].includes(status));
    const detail = response.body.details;
    assert.equal(detail.mode, 'sent'); assert.equal(detail.request.url, endpoint);
    assert.deepEqual(detail.request.body, call.payload); assert.equal(detail.response.status, 200);
    assert.equal(detail.outcome, 'DITERIMA_ENDPOINT'); assert(detail.finished_at);
    assert.equal(detail.request.headers.Authorization, call.headers.Authorization);
    assert(!detail.response.body.includes('existing-test-secret'));
  }
  const count = calls.length;
  assert.equal((await api({ id: job.id, status: 'BAD' })).code, 400);
  assert.equal((await api({ id: job.id, status: 'READ', url: 'https://evil.example' })).code, 400);
  assert.equal((await api({ id: job.id, status: 'READ' }, { ...admin, email: 'other@example.com' })).code, 403);
  assert.equal((await api({}, admin, 'GET')).code, 405);
  missing = true; assert.equal((await api({ id: job.id, status: 'READ' })).code, 404); missing = false;
  device = { ...device, url: 'https://other.example/hook' };
  assert.equal((await api({ id: job.id, status: 'READ' })).code, 409); assert.equal(calls.length, count);
  config.secret = 'dispatch-test-secret';
  fail = true; const failure = await api({ id: job.id, status: 'FAILED' }); assert.equal(failure.code, 502);
  assert.equal(failure.body.details.response.status, 422); assert.equal(failure.body.details.outcome, 'BELUM_TERKONFIRMASI');
  assert.equal(failure.body.details.request.headers.Authorization, 'Bearer dispatch-test-secret');
  assert(!failure.body.details.response.body.includes('dispatch-test-secret'));
  assert.equal(events.at(-1).status, 'FAILED'); assert.equal(events.at(-1).lastError, 'MANUAL_DELIVERY_UNCONFIRMED');
  assert.equal(calls.length, count + 1, 'One transport attempt; no automatic retry');
  assert.equal(JSON.stringify(job), original, 'Dispatch never mutated');
  console.log('Manual dispatch webhook: seven statuses, identifiers, timestamps, admin restriction, validation, key scoping, history, no retries and no dispatch writes passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
