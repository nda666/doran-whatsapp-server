const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const ts = require('typescript');
const defaults = value => ({ __esModule: true, default: value });
function load(relative, stubs = {}) {
  const filename = path.resolve(__dirname, '..', relative), module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const real = createRequire(filename);
  new Function('require', 'module', 'exports', source)(name => Object.hasOwn(stubs, name) ? stubs[name] : real(name), module, module.exports);
  return module.exports;
}
process.env.SETTINGS_ENCRYPTION_KEY = 'test-only-key';
process.env.NEXTAUTH_URL = 'https://dashboard.example.invalid';
const settings = load('src/lib/globalSettings.ts');
const access = load('src/lib/access.ts');
const id = '8b9ac141-7e76-42a0-8aeb-652bb05267d8';
const admin = { id: 'main-admin', email: access.SUPER_ADMIN_EMAIL, role: 'ADMIN', approvalStatus: 'APPROVED', isActive: true, token: 'test-admin-token', sessionVersion: 0 };
let user = { id: 'user-a', name: '<img src=x onerror=alert(1)>', email: 'user@example.invalid', role: 'USER', approvalStatus: 'APPROVED', isActive: true, password: 'original-hash', sessionVersion: 0 };
let actor = admin, rows = [], resetRows = new Map(), rateRows = new Map(), attempts = 0n, writes = 0, sessionDeletes = 0, disconnects = 0, sends = [], providerFails = false;
const db = {
  globalSetting: {
    findMany: async () => rows,
    findUnique: async ({ where }) => rows.find(row => where.id ? row.id === where.id : row.key === where.key) || null,
    create: async ({ data }) => { if (rows.some(row => row.key === data.key)) throw { code: 'P2002' }; const row = { id, ...data }; rows.push(row); return row; },
    update: async ({ where, data }) => { const row = rows.find(row => row.id === where.id); Object.assign(row, data); return row; },
  },
  user: {
    findFirst: async ({ where }) => actor && where.token === actor.token ? actor : null,
    findUnique: async ({ where }) => user && (where.id === user.id || where.email === user.email) ? user : null,
    update: async ({ data }) => { user = { ...user, ...data, sessionVersion: user.sessionVersion + data.sessionVersion.increment }; writes++; return user; },
  },
  passwordResetToken: {
    create: async ({ data }) => { resetRows.set(data.tokenHash, { ...data }); return data; },
    findUnique: async ({ where }) => resetRows.get(where.tokenHash) || null,
    deleteMany: async ({ where }) => { let count = 0; for (const [hash, row] of resetRows) if (where.tokenHash === hash || where.userId === row.userId || (where.expiresAt && row.expiresAt < where.expiresAt.lt)) { resetRows.delete(hash); count++; } return { count }; },
  },
  authRateLimit: {
    deleteMany: async () => ({}),
    createMany: async ({ data }) => { for (const row of data) if (!rateRows.has(row.key)) rateRows.set(row.key, { ...row }); },
    update: async ({ where }) => { const row = rateRows.get(where.key); row.count++; return { ...row }; },
  },
  emailSequence: {
    createMany: async () => ({}), update: async () => ({ attempts: ++attempts }),
  },
  session: { deleteMany: async () => { sessionDeletes++; } },
  $queryRaw: async () => [],
};
// Serialize transactions like the user FOR UPDATE lock, to test simultaneous token consumption.
let tail = Promise.resolve();
db.$transaction = fn => { const next = tail.then(() => fn(db)); tail = next.catch(() => {}); return next; };
const originalFetch = global.fetch;
global.fetch = async (url, options) => {
  assert.equal(url, 'https://api.postmarkapp.com/email');
  assert.equal(options.headers['X-Postmark-Server-Token'], 'test-server-token');
  sends.push(JSON.parse(options.body));
  return { ok: !providerFails, json: async () => ({ ErrorCode: providerFails ? 422 : 0 }) };
};
const reset = load('src/server/passwordReset.ts', { '@/lib/prisma': { prisma: db }, '@/lib/globalSettings': settings });
const auth = load('src/middleware/apiAuthMiddleware.ts', { '../lib/prisma': { prisma: db }, '../lib/access': access, 'next-auth/jwt': { getToken: async () => null } }).default;
const guard = load('src/middleware/apiSuperAdminMiddleware.ts', { '../lib/access': access, './apiAuthMiddleware': defaults(auth) }).default;
const settingApi = load('src/pages/api/admin/global-settings.ts', { '@/lib/prisma': { prisma: db }, '@/lib/globalSettings': settings, '@/middleware/apiSuperAdminMiddleware': defaults(guard) }).default;
const forgotApi = load('src/pages/api/forgot-password.ts', { '@/lib/prisma': { prisma: db }, '@/lib/access': access, '@/server/passwordReset': reset }).default;
const resetApi = load('src/pages/api/reset-password.ts', { '@/lib/prisma': { prisma: db }, '@/lib/access': access, '@/server/passwordReset': reset, bcrypt: defaults({ hash: async value => `hashed:${value}` }), '@/server/libs/socket': { getSocketIO: { in: () => ({ disconnectSockets: () => disconnects++ }) } } }).default;
async function request(handler, method, body, extra = {}) {
  const res = { code: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.code = n; return this; }, json(v) { this.body = v; return this; }, end() { return this; } };
  await handler({ method, body, query: {}, socket: { remoteAddress: '127.0.0.1' }, headers: { origin: process.env.NEXTAUTH_URL, ...extra.headers } }, res);
  return res;
}
const adminRequest = (method, body) => request(settingApi, method, body, { headers: { authorization: `Bearer ${actor?.token || 'invalid'}` } });
const tokenFromEmail = email => new URLSearchParams(new URL(email.TextBody.match(/https:\/\/\S+/)[0]).hash.slice(1)).get('token');
const validReset = token => ({ token, password: 'abc123', passwordConfirm: 'abc123' });
(async () => {
  assert.equal(settings.slugSettingKey('  Café / API_Key!  '), 'cafe-api-key');
  assert.equal(settings.sanitizeSettingValue(' \u0000abc\u202e\r\ndef '), 'abc\ndef');
  const value = '<script>alert(1)</script> & "value"';
  const encrypted = settings.encryptSetting(value);
  assert(!encrypted.includes('script')); assert.equal(settings.decryptSetting(encrypted), value);
  assert.notEqual(settings.encryptSetting(value), encrypted);
  const pieces = encrypted.split(':'); pieces[2] = Buffer.alloc(16).toString('base64'); assert.throws(() => settings.decryptSetting(pieces.join(':')));
  let res = await adminRequest('POST', { label: ' My Setting ', key: '', value: ' abc\u0000 ' });
  assert.equal(res.code, 201); assert.equal(res.body.key, 'my-setting'); assert.equal(res.body.value, 'abc');
  assert(rows[0].value.startsWith('enc-v1:'));
  assert.equal((await adminRequest('POST', { label: 'Duplicate', key: 'My Setting', value: 'other' })).code, 409);
  assert.equal((await adminRequest('PATCH', { id, label: 'Rename', key: 'new-key', value: 'changed' })).code, 409);
  res = await adminRequest('PATCH', { id, label: 'Rename', value: 'changed' });
  assert.equal(res.code, 200); assert.equal(res.body.key, 'my-setting'); assert.equal(res.body.label, 'Rename');
  assert.equal((await adminRequest('POST', { label: '!!!', value: 'abc' })).code, 400);
  assert.equal((await adminRequest('POST', { label: 'Token', key: settings.POSTMARK_TOKEN_KEY, value: 'bad' })).code, 400);
  assert.equal((await adminRequest('POST', { label: 'Label', value: 'v', role: 'ADMIN' })).code, 400);
  assert.equal((await adminRequest('GET')).headers['Cache-Control'], 'no-store');
  for (const denied of [{ ...admin, role: 'USER' }, { ...admin, email: 'other-admin@example.invalid' }, { ...admin, isActive: false }]) { actor = denied; assert.equal((await adminRequest('GET')).code, 403); }
  actor = null; assert.equal((await adminRequest('GET')).code, 401); actor = admin;

  rows.push({ id: 'token-id', key: settings.POSTMARK_TOKEN_KEY, label: 'Postmark Server Token', value: settings.encryptSetting('test-server-token') });
  for (let i = 0; i < 4; i++) await reset.sendResetEmail(user.email, user.name, reset.passwordResetUrl('a'.repeat(64)), 'test-server-token');
  assert.deepEqual(sends.map(row => row.MessageStream), ['outbound', 'broadcast', 'outbound', 'broadcast']);
  assert(sends[0].HtmlBody.includes('&lt;img')); assert(!sends[0].HtmlBody.includes('<img'));
  assert.equal(sends[0].From, 'wa@dorandev.com');
  assert.equal(new URL(reset.passwordResetUrl('a'.repeat(64))).search, '');
  sends = [];
  res = await request(forgotApi, 'POST', { email: user.email });
  assert.equal(res.code, 200); assert.equal(sends.length, 1);
  const knownMessage = res.body.message;
  res = await request(forgotApi, 'POST', { email: 'unknown@example.invalid' });
  assert.equal(res.code, 200); assert.equal(res.body.message, knownMessage); assert.equal(sends.length, 1);
  const firstToken = tokenFromEmail(sends[0]);
  assert.match(firstToken, /^[a-f0-9]{64}$/);
  assert(!resetRows.has(firstToken)); assert(resetRows.has(reset.resetTokenHash(firstToken)));
  res = await request(resetApi, 'POST', validReset(firstToken));
  assert.equal(res.code, 200); assert.equal(user.password, 'hashed:abc123'); assert.equal(user.sessionVersion, 1);
  assert.equal(sessionDeletes, 1); assert.equal(disconnects, 1); assert.equal(resetRows.size, 0);
  assert.equal((await request(resetApi, 'POST', validReset(firstToken))).code, 400); assert.equal(writes, 1);

  async function fixtureToken(overrides = {}) {
    const token = reset.newResetToken();
    resetRows.set(reset.resetTokenHash(token), { tokenHash: reset.resetTokenHash(token), userId: user.id, email: user.email, sessionVersion: user.sessionVersion, passwordHash: reset.resetTokenHash(user.password), expiresAt: new Date(Date.now() + 60000), ...overrides });
    return token;
  }
  for (const overrides of [{ expiresAt: new Date(0) }, { email: 'old@example.invalid' }, { sessionVersion: -1 }, { passwordHash: 'stale' }]) {
    assert.equal((await request(resetApi, 'POST', validReset(await fixtureToken(overrides)))).code, 400);
  }
  const inactiveToken = await fixtureToken(); user.isActive = false;
  assert.equal((await request(resetApi, 'POST', validReset(inactiveToken))).code, 400);
  rateRows.clear(); sends = [];
  assert.equal((await request(forgotApi, 'POST', { email: user.email })).body.message, knownMessage); assert.equal(sends.length, 0); user.isActive = true;
  const parallelToken = await fixtureToken();
  const concurrent = await Promise.all([request(resetApi, 'POST', validReset(parallelToken)), request(resetApi, 'POST', validReset(parallelToken))]);
  assert.deepEqual(concurrent.map(row => row.code).sort(), [200, 400]); assert.equal(writes, 2);
  assert.equal((await request(resetApi, 'POST', { ...validReset('a'.repeat(64)), password: 'short' })).code, 400);
  assert.equal((await request(resetApi, 'POST', { ...validReset('a'.repeat(64)), passwordConfirm: 'mismatch' })).code, 400);
  assert.equal((await request(resetApi, 'POST', validReset('a'.repeat(64)), { headers: { origin: 'https://foreign.invalid' } })).code, 403);
  assert.equal((await request(forgotApi, 'GET')).code, 405);
  assert.equal((await request(forgotApi, 'POST', { email: 'invalid' })).code, 400);

  rateRows.clear(); sends = []; providerFails = true;
  const before = resetRows.size;
  const originalError = console.error; console.error = () => {};
  try { res = await request(forgotApi, 'POST', { email: user.email }); } finally { console.error = originalError; }
  assert.equal(res.code, 200); assert.equal(res.body.message, knownMessage); assert.equal(resetRows.size, before);
  providerFails = false;
  rateRows.clear(); sends = [];
  for (let i = 0; i < 5; i++) assert.equal((await request(forgotApi, 'POST', { email: user.email })).code, 200);
  assert.equal(sends.length, 3, 'Only three reset emails per account/window');
  rateRows.clear();
  const decisions = await Promise.all(Array.from({ length: 8 }, () => reset.authRateLimit('test-limit', 'identity', 3)));
  assert.equal(decisions.filter(Boolean).length, 3, 'Concurrent requests share a persistent limiter');
  const React = require('react');
  const { renderToStaticMarkup } = require('react-dom/server');
  const GlobalSettings = load('src/components/GlobalSettings.tsx', { '@/lib/useDashboardApi': { useDashboardApi: () => ({ data: [{ id, key: 'sample', label: 'Sample', value: '<script>alert(1)</script>', secret: false }], headers: {}, reload() {} }) } }).default;
  const html = renderToStaticMarkup(React.createElement(GlobalSettings));
  assert(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert(!html.includes('<script>alert(1)</script>'), 'Setting markup must render as plain text');
  console.log('GLOBAL_SETTINGS_RESET_OK: encrypted values, text sanitization, slug/immutable keys, admin access, Postmark alternation/escaping, hashed expiring tokens, replay/concurrent use protection, stale credentials, session revocation, generic responses, provider failures and rate limits. No real emails sent.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { global.fetch = originalFetch; });
