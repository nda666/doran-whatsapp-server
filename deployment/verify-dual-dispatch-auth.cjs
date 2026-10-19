const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { createRequire } = require('node:module'), ts = require('typescript');
const defaults = value => ({ __esModule: true, default: value });
function load(relative, stubs = {}) {
  const filename = path.resolve(__dirname, '..', relative), module = { exports: {} }, real = createRequire(filename);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', code)(name => Object.hasOwn(stubs, name) ? stubs[name] : real(name), module, module.exports);
  return module.exports;
}
const users = [{ id: 'owner', token: 'user-token', isActive: true, approvalStatus: 'APPROVED' }, { id: 'other', token: 'other-user-token', isActive: true, approvalStatus: 'APPROVED', role: 'ADMIN', email: 'admin@gmail.com' }];
const phones = [{ id: 'own-phone', userId: 'owner', token: 'device-token', active: 1, isOnline: true }, { id: 'second-phone', userId: 'owner', token: 'second-device-token', active: 1, isOnline: false }, { id: 'foreign-phone', userId: 'other', token: 'foreign-device-token', active: 1, isOnline: false }];
const jobs = [{ id: 'dispatch-1', phoneId: 'own-phone', userId: 'owner', transactionId: 'ORDER-1', storeId: 'default', status: 'QUEUED' }];
let enqueues = 0, sendingDisabled = false;
const db = { phone: {
  findUnique: async ({ where }) => phones.find(phone => phone.token === where.token) || null,
  findFirst: async ({ where }) => phones.find(phone => phone.id === where.id && phone.userId === where.userId) || null,
}, user: { findUnique: async ({ where }) => users.find(user => where.token ? user.token === where.token : user.id === where.id) || null },
waDispatch: {
  findMany: async ({ where }) => jobs.filter(job => job.phoneId === where.phoneId && (!where.id || job.id === where.id)),
  count: async ({ where }) => jobs.filter(job => job.phoneId === where.phoneId && (!where.id || job.id === where.id)).length,
} };
const access = load('src/lib/access.ts'), auth = load('src/server/dispatchAuth.ts', { '@/lib/prisma': { prisma: db }, '@/lib/access': access });
const responseBody = { result: true, queued: true, data: [{ id: 'dispatch-1', status: 'QUEUED' }], status_url: '/api/send-status' };
const queue = {
  requestJobId: body => body.job_id || null, requestJobKey: (phoneId, id) => phoneId + id, dispatchSummary: job => ({ id: job.id, status: job.status }),
  prepareDispatch() {}, existingRequestJob: async (_, body) => body.job_id === 'existing' ? { ...responseBody, existing: true } : null,
  enqueueDispatch: async (phoneId, userId) => { assert.equal(phoneId, 'own-phone'); assert.equal(userId, 'owner'); enqueues++; return responseBody; },
  DispatchError: class extends Error { constructor(status,message) { super(message); this.status=status; } },
};
const stubs = { '@/server/dispatchAuth': auth, '@/lib/prisma': { prisma: db }, '@/server/dispatch/queue': queue,
  '@/server/libs/sendMessageFromIo': defaults(async () => { assert(sendingDisabled); return ['fake-transport-result']; }),
  '@/validations/sendMessage': { SendMessageValidation: async () => ({ result: true }) } };
const send = load('src/pages/api/send-message.ts', stubs).default, status = load('src/pages/api/send-status.ts', stubs).default;
async function request(handler, body, authorization, query = {}, method = 'POST') {
  const res = { code: 200, setHeader() {}, status(n) { this.code = n; return this; }, json(v) { this.body = v; return this; } };
  await handler({ method, body, query, headers: authorization ? { authorization } : {} }, res); return res;
}
const payload = { number: '6281234567890', message: 'Synthetic test', transaction_id: 'ORDER-1' };
process.env.DISPATCH_QUEUE_ENABLED = 'true';
(async () => {
  const legacy = await request(send, { ...payload, api_key: 'device-token' }); assert.equal(legacy.code, 200);
  for (const [body, header, query, method] of [
    [{ ...payload }, 'Bearer device-token', {}, 'POST'], [{ ...payload }, null, { api_key: 'device-token' }, 'POST'],
    [{}, null, { ...payload, api_key: 'device-token' }, 'GET'], [{ ...payload, token_api: 'device-token' }, null, {}, 'POST'],
    [{ ...payload, api_key: 'device-token' }, 'Bearer device-token', { api_key: 'device-token' }, 'POST'],
    [{ ...payload, device_id: 'own-phone' }, 'Bearer user-token', {}, 'POST'],
    [{}, 'Bearer user-token', { ...payload, device_id: 'own-phone' }, 'GET'],
  ]) { const result = await request(send, body, header, query, method); assert.equal(result.code, 200); assert.deepEqual(result.body, legacy.body); }
  const before = enqueues;
  for (const [body, header, code] of [
    [{ ...payload }, 'Bearer user-token', 400], [{ ...payload, device_id: 'foreign-phone' }, 'Bearer user-token', 403],
    [{ ...payload, device_id: 'own-phone' }, 'Bearer other-user-token', 403],
    [{ ...payload, api_key: 'device-token' }, 'Bearer user-token', 400],
    [{ ...payload, device_id: 'second-phone', api_key: 'device-token' }, null, 403],
    [{ ...payload, device_id: ['own-phone'] }, 'Bearer user-token', 400],
    [{ ...payload, device_id: 'own-phone', api_key: 'user-token' }, null, 400],
  ]) assert.equal((await request(send, body, header)).code, code);
  assert.equal(enqueues, before, 'Rejected authorization must never enqueue');
  assert.equal((await request(send, { ...payload, api_key: 'invalid' })).code, 200);
  assert.equal((await request(send, { ...payload, api_key: 'invalid' })).body.result, false);
  assert.equal((await request(status, { id: 'dispatch-1', api_key: 'invalid' })).code, 401);
  const deviceStatus = await request(status, { id: 'dispatch-1', api_key: 'device-token' });
  const userStatus = await request(status, { id: 'dispatch-1', device_id: 'own-phone' }, 'Bearer user-token'); assert.deepEqual(userStatus.body, deviceStatus.body);
  assert.equal((await request(status, { id: 'dispatch-1', device_id: 'second-phone' }, 'Bearer user-token')).body.total, 0);
  assert.equal((await request(status, { id: 'dispatch-1', device_id: 'foreign-phone' }, 'Bearer user-token')).code, 403);
  assert.equal((await request(send, { ...payload, device_id: 'own-phone' }, 'Bearer user-token', { device_id: 'second-phone' })).code, 400);
  users[0].isActive = false;
  assert.equal((await request(send, { ...payload, api_key: 'device-token' })).code, 403);
  assert.equal((await request(send, { ...payload, device_id: 'own-phone' }, 'Bearer user-token')).code, 403); users[0].isActive = true;
  users[0].approvalStatus = 'PENDING'; assert.equal((await request(status, { id: 'dispatch-1', api_key: 'device-token' })).code, 403); users[0].approvalStatus = 'APPROVED';
  phones[0].active = 0;
  assert.equal((await request(send, { ...payload, device_id: 'own-phone' }, 'Bearer user-token')).code, 409);
  assert.equal((await request(send, { ...payload, api_key: 'device-token', job_id: 'existing' })).body.existing, true);
  assert.equal((await request(send, { ...payload, device_id: 'own-phone', dry_run: true }, 'Bearer user-token')).body.active, false); phones[0].active = 1;
  sendingDisabled = true; process.env.DISPATCH_QUEUE_ENABLED = 'false';
  const directLegacy = await request(send, { ...payload, api_key: 'device-token' });
  const directUser = await request(send, { ...payload, device_id: 'own-phone' }, 'Bearer user-token'); assert.deepEqual(directUser.body, directLegacy.body);
  for (const [file, moduleName] of [['src/pages/api/public/send-message.ts','../send-message'],['src/pages/api/v2/send-message.ts','../send-message'],['src/pages/api/public/v2/send-message.ts','../../send-message'],['src/pages/api/public/send-status.ts','../send-status']]) {
    const expected = file.includes('send-status') ? status : send; assert.equal(load(file, { [moduleName]: defaults(expected) }).default, expected);
  }
  console.log('DUAL_DISPATCH_AUTH_OK: legacy API key/Bearer/GET/JSON/form/query, same response envelopes, user+device ownership/no admin bypass, conflicts, status isolation, inactive accounts/devices, dry run, idempotent replay, direct fallback and all aliases. No real messages sent.');
})().catch(error => { console.error(error); process.exitCode = 1; });
