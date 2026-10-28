// Synthetic requests only: no database or WhatsApp connection.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { z } = require('zod');
function load(file, mocks) {
  const mod = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', source)(key => key in mocks ? mocks[key] : require(key), mod, mod.exports);
  return mod.exports;
}
const id = '6f3177a2-9d54-4a62-a62c-4e0acecb06f0';
let allowed = true, stopped = false, fail = false, locks = 0;
let policy = { warmupStartedAt: new Date('2026-10-01T00:00:00Z'), dailyLimit: 900, paused: true,
  pauseReason: 'restricted', adaptiveEnabled: true, nextAllowedAt: new Date('2099-01-01') };
const tx = {
  $queryRaw: async () => { locks++; },
  phone: { findFirst: async ({ where }) => {
    assert.equal(where.id, id);
    assert.deepEqual(where.NOT, { id: { notIn: [id] } });
    return allowed ? { id } : null;
  } },
  deviceSendPolicy: { updateMany: async ({ where, data }) => {
    assert.equal(where.phoneId, id);
    assert.deepEqual(where.warmupStartedAt, { not: null });
    if (fail) throw Error('Synthetic write failure');
    if (stopped || !policy?.warmupStartedAt) return { count: 0 };
    policy = { ...policy, ...data };
    return { count: 1 };
  } },
};
// No usage/dispatch/window writers supplied: touching these would fail the test.
const handler = load('src/pages/api/device-policies.ts', {
  '@/lib/quotaReset': { quotaResetInput: z.any() },
  '@/lib/operatingHours': { operatingHoursInput: z.any() },
  '@/server/dispatch/settings': {}, '@/lib/deviceQuota': {}, '@/server/messaging/safety': {},
  '@/lib/access': { phoneScope: () => ({ NOT: { id: { notIn: [id] } } }) },
  '@/lib/prisma': { prisma: { $transaction: async fn => fn(tx) } },
  '@/middleware/apiAuthMiddleware': { __esModule: true, default: fn => fn },
}).default;
const settings = load('src/lib/warmupSettings.ts', {});
const { warmupLimit } = load('src/server/messaging/safety.ts', {
  '../../lib/warmupSettings': settings, '../../lib/dispatchPresentation': {}, '../dispatchWebhook/events': {},
  '../../lib/prisma': {}, '../../utils/normalizePhoneRecipient': {}, '../../lib/deviceQuota': {},
  '../dispatch/settings': {}, '../dispatch/timing': {}, '../../lib/deviceSendInterval': {}, '../../lib/quotaReset': {}, '../../lib/operatingHours': {},
});
async function request(body, method = 'PATCH') {
  const res = { code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; }, end() {} };
  await handler({ method, body, user: { id: 'owner' } }, res);
  return res;
}
(async () => {
  const body = { phoneId: id, action: 'restart-warmup' };
  const before = structuredClone(policy);
  assert.equal((await request(body)).code, 200);
  assert(policy.warmupStartedAt > before.warmupStartedAt);
  assert.deepEqual({ ...policy, warmupStartedAt: before.warmupStartedAt }, before);
  const started = policy.warmupStartedAt.getTime();
  assert.equal(warmupLimit(policy.warmupStartedAt, 900, started), 25);
  assert.equal(warmupLimit(policy.warmupStartedAt, 900, started + 2 * 86400000), 50);
  assert.equal(warmupLimit(policy.warmupStartedAt, 10, started), 10);
  assert.equal(warmupLimit(policy.warmupStartedAt, 900, started, [7, 15]), 7);
  const current = structuredClone(policy);
  allowed = false;
  assert.equal((await request(body)).code, 404);
  assert.deepEqual(policy, current);
  allowed = true; stopped = true;
  assert.equal((await request(body)).code, 409);
  assert.deepEqual(policy, current);
  stopped = false; fail = true;
  await assert.rejects(request(body), /Synthetic write failure/);
  assert.deepEqual(policy, current);
  fail = false;
  policy = null;
  assert.equal((await request(body)).code, 409);
  policy = { ...current, warmupStartedAt: null };
  assert.equal((await request(body)).code, 409);
  const locksBeforeInvalid = locks;
  for (const invalid of [{}, { ...body, phoneId: 'invalid' }, { ...body, action: 'start' }, { ...body, paused: false }]) {
    assert.equal((await request(invalid)).code, 400);
  }
  assert.equal(locks, locksBeforeInvalid);
  assert.equal((await request(body, 'POST')).code, 405);
  const phrases = [
    'Ulangi pemanasan', 'Pemanasan gagal diulang.', 'Permintaan ulang pemanasan tidak valid.',
    'Pemanasan nomor sudah tidak aktif. Muat ulang data perangkat.',
    'Pemanasan diulang dari tahap pertama. Pemakaian kuota hari ini dan status jeda tetap berlaku.',
    'Untuk kembali ke tahap pertama, gunakan Aksi → Ulangi pemanasan pada daftar perangkat. Pemakaian kuota hari ini dan status jeda tetap berlaku.',
  ];
  for (const language of ['id', 'en', 'es', 'ar', 'hi']) {
    const catalog = JSON.parse(fs.readFileSync(`public/locales/${language}/interface.json`, 'utf8'));
    for (const phrase of phrases) assert(catalog[phrase]?.trim(), `${language}: ${phrase}`);
  }
  console.log('WARMUP_RESTART_OK: restart stages, custom limits, device cap, preserve pause/settings/usage, access scope, inactive/missing policy, stale stop, write failure, validation and method checks');
})().catch(error => { console.error(error); process.exitCode = 1; });
