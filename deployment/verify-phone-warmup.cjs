'use strict';
// Synthetic transactions only; no network or real messages.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const id = '6f3177a2-9d54-4a62-a62c-4e0acecb06f0';
let policy, foreign = false, fail = false, phoneData, events = 0;
const tx = {
  $queryRaw: async () => [],
  user: { findUniqueOrThrow: async () => ({ deviceLimit: 100 }) },
  phone: { findFirst: async () => foreign ? null : ({ id, saveIncomingMessages: false }), count: async () => 0,
    create: async ({ data }) => (phoneData = { id, ...data }) },
  deviceSendPolicy: {
    upsert: async ({ create, update }) => {
      if (fail) throw Error('Synthetic write failure');
      policy = policy ? { ...policy, ...update } : { ...create };
    },
    updateMany: async ({ data }) => { if (policy.warmupStartedAt === null) Object.assign(policy, data); },
  },
};
const mocks = {
  '@/server/dispatch/settings': {}, '@/lib/tableQuery': {}, '@/lib/phonePolicySort': {}, '@/server/messaging/phonePolicySort': {},
  '@/lib/access': { ownerScope: () => ({ userId: 'owner' }), isSuperAdmin: () => true },
  '@/lib/prisma': { prisma: { $transaction: async fn => {
    const before = { policy: structuredClone(policy), phoneData: structuredClone(phoneData), events };
    try { return await fn(tx); } catch (error) { ({ policy, phoneData, events } = before); throw error; }
  } } },
  '@/middleware/apiAuthMiddleware': { __esModule: true, default: fn => fn },
  '@/server/deviceWebhook/events': { enqueueDeviceEvent: async () => { events++; }, updateDevice: async (_tx, _where, data) => (phoneData = { id, ...data }) },
  '@/server/phoneConnectionInfo': {},
};
const mod = { exports: {} };
new Function('require', 'module', 'exports', ts.transpileModule(fs.readFileSync('src/pages/api/phones/index.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText)(key => key in mocks ? mocks[key] : require(key), mod, mod.exports);
async function post(body) {
  const res = { code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json() {}, end() {} };
  await mod.exports.default({ method: 'POST', body, user: { id: 'owner' } }, res);
  return res.code;
}
(async () => {
  assert.equal(await post({ name: 'Create', warmupEnabled: true }), 201);
  assert(policy.warmupStartedAt instanceof Date);
  assert(!('warmupEnabled' in phoneData));
  const startedAt = policy.warmupStartedAt;
  policy.dailyLimit = 900; policy.paused = true;
  assert.equal(await post({ id, name: 'Keep enabled', warmupEnabled: true }), 200);
  assert.equal(policy.warmupStartedAt, startedAt);
  assert.equal(policy.dailyLimit, 900); assert.equal(policy.paused, true);
  await post({ id, name: 'Old client omits flag' });
  assert.equal(policy.warmupStartedAt, startedAt);
  await post({ id, name: 'Stop', warmupEnabled: false });
  assert.equal(policy.warmupStartedAt, null);
  await post({ id, name: 'Restart', warmupEnabled: true });
  assert(policy.warmupStartedAt instanceof Date);
  foreign = true;
  const before = structuredClone(policy);
  assert.equal(await post({ id, name: 'Foreign', warmupEnabled: false }), 404);
  assert.deepEqual(policy, before); foreign = false;
  fail = true;
  const priorPhone = structuredClone(phoneData);
  await assert.rejects(post({ id, name: 'Rollback', warmupEnabled: true }), /Synthetic/);
  assert.deepEqual(phoneData, priorPhone);
  assert.equal(await post({ name: 'Failed create', warmupEnabled: true }), 409);
  assert.deepEqual(phoneData, priorPhone); fail = false;
  assert.equal(await post({ id, name: 'Bad flag', warmupEnabled: 'yes' }), 400);
  policy = undefined;
  await post({ name: 'Default' }); assert.equal(policy, undefined);
  await post({ name: 'Explicit off', warmupEnabled: false }); assert.equal(policy.warmupStartedAt, null);
  const form = fs.readFileSync('src/components/phone/PhoneFormModal.tsx', 'utf8');
  const controls = fs.readFileSync('src/components/phone/PhonePolicyControls.tsx', 'utf8');
  assert.match(form, /name="warmupEnabled"/);
  assert.match(form, /form.setFieldValue\("warmupEnabled", !!startedAt\)/);
  assert(!controls.includes('name="warmupEnabled"'));
  assert(!controls.includes('warmupAction'));
  console.log('PHONE_WARMUP_OK: create, edit, preserve start and other limits, stop/restart, legacy omission, access scope, rollback, invalid flag, default off, form placement');
})().catch(error => { console.error(error); process.exitCode = 1; });
