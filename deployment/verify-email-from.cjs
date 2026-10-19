const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const ts = require('typescript');
function load(relative, stubs = {}) {
  const filename = path.resolve(__dirname, '..', relative), module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const real = createRequire(filename);
  new Function('require', 'module', 'exports', source)(name => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    return name.startsWith('@/lib/') ? load('src/lib/' + name.slice(6) + '.ts', stubs) : real(name);
  }, module, module.exports);
  return module.exports;
}
process.env.SETTINGS_ENCRYPTION_KEY = 'test-only-email-setting';
const settings = load('src/lib/globalSettings.ts');
const email = load('src/lib/emailSettings.ts');
let rows = [], sends = [], attempts = 0n;
const db = { globalSetting: {
  createMany: async ({ data }) => { for (const row of data) if (!rows.some(r => r.key === row.key)) rows.push({ id: String(rows.length), ...row }); },
  findMany: async () => rows,
  findUnique: async ({ where }) => rows.find(r => where.key ? r.key === where.key : r.id === where.id) || null,
  create: async ({ data }) => { const row = { id: '00000000-0000-4000-8000-000000000001', ...data }; rows.push(row); return row; },
  update: async ({ where, data }) => Object.assign(rows.find(r => r.id === where.id), data),
}, emailSequence: { createMany: async () => {}, update: async () => ({ attempts: ++attempts }) } };
const stubs = { '@/lib/prisma': { prisma: db }, '@/middleware/apiSuperAdminMiddleware': { __esModule: true, default: fn => fn } };
const api = load('src/pages/api/admin/global-settings.ts', stubs).default;
const reset = load('src/server/passwordReset.ts', stubs);
async function request(method, body) {
  const res = { code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await api({ method, body }, res);
  return res;
}
const originalFetch = global.fetch;
global.fetch = async (_, options) => { sends.push(JSON.parse(options.body)); return { ok: true, json: async () => ({ ErrorCode: 0 }) }; };
(async () => {
  const send = () => reset.sendResetEmail('recipient@example.com', 'User', 'https://example.com/reset', 'test-token');
  await send();
  assert.equal(sends[0].From, email.DEFAULT_EMAIL_FROM, 'Existing installations keep their original sender');
  await request('GET');
  assert.equal(rows.filter(r => r.key === email.EMAIL_FROM_KEY).length, 1);
  const sender = rows.find(r => r.key === email.EMAIL_FROM_KEY);
  assert.equal(settings.decryptSetting(sender.value), email.DEFAULT_EMAIL_FROM);
  for (const value of ['', 'invalid', 'Name <sender@example.com>', 'sender@example.com\r\nBcc: other@example.com']) {
    assert.equal((await request('POST', { label: email.EMAIL_FROM_LABEL, key: email.EMAIL_FROM_KEY, value })).code, 400);
  }
  sender.id = '00000000-0000-4000-8000-000000000001';
  assert.equal((await request('PATCH', { id: sender.id, label: email.EMAIL_FROM_LABEL, value: ' support@example.com ' })).code, 200);
  await request('GET');
  assert.equal(settings.decryptSetting(sender.value), 'support@example.com', 'Loading settings preserves edits');
  await send();
  assert.equal(sends[1].From, 'support@example.com', 'Next send reads the configured sender without restart');
  assert.deepEqual(sends.map(s => s.MessageStream), ['outbound', 'broadcast']);
  sender.value = settings.encryptSetting('broken');
  await assert.rejects(send);
  assert.equal(sends.length, 2, 'Invalid stored sender is rejected before calling Postmark');
  console.log('EMAIL_FROM_OK: default, initialization, validation, edit, persistence, dynamic sender and stream regression. No real emails sent.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { global.fetch = originalFetch; });
