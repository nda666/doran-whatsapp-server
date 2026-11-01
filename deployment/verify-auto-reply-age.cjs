'use strict';
// Offline setting/API and timestamp checks; no external network, production DB or WhatsApp.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const ts = require('typescript');
function load(relative, stubs = {}) {
  const filename = path.resolve(__dirname, '..', relative), module = { exports: {} }, real = createRequire(filename);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', code)(name => Object.hasOwn(stubs, name) ? stubs[name] : real(name), module, module.exports);
  return module.exports;
}
(async () => {
  const age = load('src/lib/autoReplyAge.ts');
  assert.equal(age.parseAutoReplyMaxAge('0'), 0); assert.equal(age.parseAutoReplyMaxAge('120'), 120);
  assert.equal(age.parseAutoReplyMaxAge('86400'), 86400);
  for (const value of ['', '-1', '1.5', '120e0', '86401', 'NaN', 'Infinity']) assert.equal(age.parseAutoReplyMaxAge(value), null, value);
  const now = 1_790_000_000_000, seconds = now / 1000;
  assert(age.autoReplyAgeAllowed(undefined, 0, now));
  assert(age.autoReplyAgeAllowed(seconds - 120, 120, now));
  assert(!age.autoReplyAgeAllowed(seconds - 121, 120, now));
  assert(age.autoReplyAgeAllowed({ toString: () => String(seconds) }, 120, now), 'protobuf Long timestamps');
  assert(age.autoReplyAgeAllowed(seconds + 60, 120, now));
  assert(!age.autoReplyAgeAllowed(seconds + 61, 120, now));
  for (const value of [undefined, null, NaN, Infinity, 0, 'invalid', { toString() { throw Error('BAD'); } }]) assert(!age.autoReplyAgeAllowed(value, 120, now));
  process.env.SETTINGS_ENCRYPTION_KEY = 'offline-auto-reply-age';
  const encryption = load('src/lib/globalSettings.ts');
  let rows = [], failDb = false, writes = 0;
  const db = { globalSetting: {
    findUnique: async ({ where }) => { if (failDb) throw Error('DB_UNAVAILABLE'); return rows.find(row => where.key ? row.key === where.key : row.id === where.id) || null; },
    findMany: async () => rows,
    createMany: async ({ data }) => { for (const row of data) if (!rows.some(old => old.key === row.key)) rows.push({ ...row, id: require('node:crypto').randomUUID() }); },
    update: async ({ where, data }) => { writes++; const row = rows.find(row => row.id === where.id); Object.assign(row, data); return row; },
  } };
  const runtime = load('src/server/messaging/autoReplyAge.ts', { '../../lib/prisma': { prisma: db }, '../../lib/globalSettings': encryption, '../../lib/autoReplyAge': age });
  assert.equal(await runtime.getAutoReplyMaxAgeSeconds(), 0, 'Absent setting preserves current behavior');
  const handler = load('src/pages/api/admin/global-settings.ts', { '@/lib/prisma': { prisma: db }, '@/lib/globalSettings': encryption, '@/lib/autoReplyAge': age,
    '@/middleware/apiSuperAdminMiddleware': { __esModule: true, default: fn => fn } }).default;
  async function request(method, body) {
    const res = { statusCode: 200, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(data) { this.data = data; return this; }, end() {} };
    await handler({ method, body, user: { id: 'admin' } }, res); return res;
  }
  const initial = await request('GET');
  const setting = initial.data.find(row => row.key === age.AUTO_REPLY_MAX_AGE_KEY);
  assert(setting); assert.equal(setting.value, '0');
  const body = { id: setting.id, label: setting.label, key: setting.key };
  assert.equal((await request('PATCH', { ...body, value: '1.5' })).statusCode, 400); assert.equal(writes, 0);
  assert.equal((await request('PATCH', { ...body, value: '120' })).statusCode, 200);
  assert.equal(await runtime.getAutoReplyMaxAgeSeconds(), 120, 'Setting applies without restart');
  assert.equal((await request('PATCH', { ...body, value: '0' })).statusCode, 200);
  assert.equal(await runtime.getAutoReplyMaxAgeSeconds(), 0);
  const row = rows.find(row => row.key === age.AUTO_REPLY_MAX_AGE_KEY);
  row.value = encryption.encryptSetting('invalid');
  await assert.rejects(runtime.getAutoReplyMaxAgeSeconds(), /INVALID_AUTO_REPLY_MAX_AGE/);
  failDb = true; await assert.rejects(runtime.getAutoReplyMaxAgeSeconds(), /DB_UNAVAILABLE/);
  console.log('AUTO_REPLY_AGE_SETTING_AND_TIMESTAMPS_OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
