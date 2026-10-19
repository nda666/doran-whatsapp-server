// Synthetic checks only; no database writes or WhatsApp messages.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(path, mocks = {}) {
  const mod = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', source)(key => key in mocks ? mocks[key] : require(key), mod, mod.exports);
  return mod.exports;
}
const settings = load('src/lib/warmupSettings.ts');
const { parseWarmupDailyLimits: parse } = settings;
assert.deepEqual(parse('25,50,100,200,350,500'), settings.DEFAULT_WARMUP_DAILY_LIMITS);
assert.deepEqual(parse(' 10, 20 , 100000 '), [10, 20, 100000]);
assert.deepEqual(parse('50'), [50]);
for (const value of ['', ' ', ',25', '25,', '25,,50', '0,25', '-1,25', '1.5,25', '25,25', '50,25', '1,100001', '1e2', 'NaN', '25;50']) assert.equal(parse(value), null, value);
const dispatchSettings = {};
const { warmupLimit } = load('src/server/messaging/safety.ts', {
  '../../lib/warmupSettings': settings,
  '../../lib/dispatchPresentation': {}, '../dispatchWebhook/events': {}, '../../lib/prisma': {},
  '../../utils/normalizePhoneRecipient': {}, '../../lib/deviceQuota': {},
  '../dispatch/settings': dispatchSettings, '../dispatch/timing': {}, '../../lib/deviceSendInterval': {},
});
const start = new Date('2026-10-01T00:00:00Z');
const at = day => start.getTime() + day * 86400000;
for (let day = 0; day < 12; day++) assert.equal(warmupLimit(start, 1000, at(day)), settings.DEFAULT_WARMUP_DAILY_LIMITS[Math.floor(day / 2)]);
assert.equal(warmupLimit(start, 1000, at(12)), 1000);
assert.equal(warmupLimit(null, 1000, at(0), [10, 40]), 1000);
assert.equal(warmupLimit(start, 1000, at(-1), [10, 40]), 10);
assert.equal(warmupLimit(start, 1000, at(1.99), [10, 40]), 10);
assert.equal(warmupLimit(start, 1000, at(2), [10, 40]), 40);
assert.equal(warmupLimit(start, 1000, at(4), [10, 40]), 1000);
assert.equal(warmupLimit(start, 30, at(2), [10, 40]), 30);
assert.equal(warmupLimit(start, 1000, at(0), [5]), 5);
assert.equal(warmupLimit(start, 1000, at(0), [15]), 15);
console.log('Warmup limits: parsing, defaults, custom stages, two-day boundaries, completion, device caps and setting changes passed.');
const globalSettings = load('src/lib/globalSettings.ts');
process.env.SETTINGS_ENCRYPTION_KEY = 'synthetic-warmup-test-only';
let rows = [];
const db = { globalSetting: {
  createMany: async ({ data }) => { for (const row of data) if (!rows.some(existing => existing.key === row.key)) rows.push({ id: '74b07541-f69b-4f25-b125-b39006ae2d99', ...row }); },
  findMany: async () => rows,
  findUnique: async ({ where }) => rows.find(row => where.key ? row.key === where.key : row.id === where.id) || null,
  update: async ({ where, data }) => { const row = rows.find(row => row.id === where.id); Object.assign(row, data); return row; },
} };
const handler = load('src/pages/api/admin/global-settings.ts', {
  '@/lib/warmupSettings': settings, '@/lib/globalSettings': globalSettings, '@/lib/prisma': { prisma: db },
  '@/middleware/apiSuperAdminMiddleware': { __esModule: true, default: fn => fn },
  '@/lib/emailSettings': load('src/lib/emailSettings.ts'),
  '@/lib/deviceQuota': load('src/lib/deviceQuota.ts'),
  '@/lib/dispatchSettings': load('src/lib/dispatchSettings.ts'),
  '@/lib/phoneFormFields': load('src/lib/phoneFormFields.ts'),
}).default;
const reader = load('src/server/dispatch/settings.ts', {
  '../../lib/warmupSettings': settings, '../../lib/globalSettings': globalSettings, '../../lib/prisma': { prisma: db },
  '../../lib/deviceQuota': load('src/lib/deviceQuota.ts'), '../../lib/dispatchSettings': load('src/lib/dispatchSettings.ts'),
});
async function request(method, body) {
  const res = { code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; }, end() {} };
  await handler({ method, body }, res); return res;
}
(async () => {
  assert.deepEqual(await reader.getWarmupDailyLimits(), settings.DEFAULT_WARMUP_DAILY_LIMITS);
  await request('GET');
  const row = rows.find(row => row.key === settings.WARMUP_DAILY_LIMITS_KEY);
  assert(row);
  assert.equal(globalSettings.decryptSetting(row.value), '25,50,100,200,350,500');
  const body = { id: row.id, label: row.label, value: ' 10, 40, 90 ' };
  assert.equal((await request('PATCH', body)).code, 200);
  assert.equal(globalSettings.decryptSetting(row.value), '10,40,90');
  assert.deepEqual(await reader.getWarmupDailyLimits(), [10, 40, 90]);
  await request('GET');
  assert.deepEqual(await reader.getWarmupDailyLimits(), [10, 40, 90]);
  for (const value of ['40,10', '0,40', '10,', '10,100001']) assert.equal((await request('PATCH', { ...body, value })).code, 400);
  assert.deepEqual(await reader.getWarmupDailyLimits(), [10, 40, 90]);
  row.value = globalSettings.encryptSetting('bad');
  await assert.rejects(reader.getWarmupDailyLimits(), /Invalid warmup/);
  console.log('Warmup settings API: default creation, encrypted save, comma normalization, immediate reading, preserving custom values and rejecting invalid input passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
