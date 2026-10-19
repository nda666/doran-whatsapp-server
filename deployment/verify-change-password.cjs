const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { createRequire } = require('node:module'), ts = require('typescript');
const defaults = value => ({ __esModule: true, default: value });
function load(relative, stubs = {}) {
  const filename = path.resolve(__dirname, '..', relative), module = { exports: {} }, real = createRequire(filename);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', source)(name => Object.hasOwn(stubs, name) ? stubs[name] : real(name), module, module.exports);
  return module.exports;
}
const access = load('src/lib/access.ts');
const initial = { id: 'own-user', email: 'fixture@example.invalid', token: 'fixture-token', password: 'hash:old123', sessionVersion: 0, approvalStatus: 'APPROVED', isActive: true };
let user = { ...initial }, session = { id: user.id, sessionVersion: 0 }, allowed = true, writes = 0, deletedSessions = 0, deletedResets = 0;
const db = { user: {
  findFirst: async ({ where }) => where.id === user.id || where.token === user.token ? { ...user } : null,
  findUnique: async () => ({ ...user }),
  update: async ({ where, data }) => { assert.equal(where.id, initial.id); assert.deepEqual(Object.keys(data).sort(), ['password', 'sessionVersion']); writes++; user = { ...user, password: data.password, sessionVersion: user.sessionVersion + 1 }; },
}, session: { deleteMany: async ({ where }) => { assert.equal(where.userId, initial.id); deletedSessions++; } }, passwordResetToken: { deleteMany: async ({ where }) => { assert.equal(where.userId, initial.id); deletedResets++; } }, $queryRaw: async () => [] };
let tail = Promise.resolve(); db.$transaction = fn => { const next = tail.then(() => fn(db)); tail = next.catch(() => {}); return next; };
process.env.NEXTAUTH_URL = 'https://dashboard.example.invalid';
const auth = load('src/middleware/apiAuthMiddleware.ts', { '../lib/prisma': { prisma: db }, '../lib/access': access, 'next-auth/jwt': { getToken: async () => session } }).default;
const handler = load('src/pages/api/change-password.ts', { '@/lib/prisma': { prisma: db }, '@/lib/access': access, '@/middleware/apiAuthMiddleware': defaults(auth),
  '@/server/passwordReset': { authRateLimit: async () => allowed, validAuthOrigin: req => !req.headers.origin || req.headers.origin === process.env.NEXTAUTH_URL },
  '@/server/libs/socket': { getSocketIO: { in: () => ({ disconnectSockets() {} }) } }, bcrypt: defaults({ compare: async (plain, hash) => hash === 'hash:' + plain, hash: async plain => 'hash:' + plain }),
}).default;
const valid = { currentPassword: 'old123', password: 'new123', passwordConfirm: 'new123' };
async function request(body = valid, headers = {}, method = 'POST') {
  const res = { code: 200, setHeader() {}, status(n) { this.code = n; return this; }, json(v) { this.body = v; return this; }, end() { return this; } };
  await handler({ method, body, query: {}, headers: { origin: process.env.NEXTAUTH_URL, ...headers } }, res); return res;
}
(async () => {
  session = null; assert.equal((await request()).code, 401); session = { id: user.id, sessionVersion: 0 };
  user.isActive = false; assert.equal((await request()).code, 403); user.isActive = true;
  for (const body of [{ ...valid, currentPassword: 'wrong1' }, { ...valid, password: 'short', passwordConfirm: 'short' }, { ...valid, passwordConfirm: 'other1' }, { ...valid, password: 'old123', passwordConfirm: 'old123' }, { ...valid, id: 'other-user' }]) assert.equal((await request(body)).code, 400);
  assert.equal((await request(valid, { origin: 'https://foreign.invalid' })).code, 403);
  allowed = false; assert.equal((await request()).code, 429); allowed = true;
  assert.equal(writes, 0);
  const concurrent = await Promise.all([request(), request()]); assert.deepEqual(concurrent.map(row => row.code).sort(), [200, 409]);
  assert.equal(writes, 1); assert.equal(user.password, 'hash:new123'); assert.equal(user.sessionVersion, 1); assert.equal(user.token, initial.token);
  assert.equal(deletedSessions, 1); assert.equal(deletedResets, 1); assert.equal((await request()).code, 401);
  session.sessionVersion = 1; assert.equal((await request(valid, {}, 'GET')).code, 405);
  console.log('CHANGE_PASSWORD_OK: authenticated owner only, current password, minimum six, confirmation, changed password, rate limit/origin, concurrent updates, revoked sessions/reset links and API token preservation.');
})().catch(error => { console.error(error); process.exitCode = 1; });
