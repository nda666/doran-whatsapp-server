const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const ts = require('typescript');
const defaults = value => ({ __esModule: true, default: value });
function load(relative, stubs = {}) {
  const filename = path.resolve(__dirname, '..', relative), module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const real = createRequire(filename);
  new Function('require', 'module', 'exports', source)(name => Object.hasOwn(stubs, name) ? stubs[name] : real(name), module, module.exports);
  return module.exports;
}
const access = load('src/lib/access.ts');
const initial = { id: 'own-user', name: 'Original', email: 'user@example.invalid', token: 'own-token', password: 'stored-hash', role: 'USER', approvalStatus: 'APPROVED', isActive: true, sessionVersion: 0 };
let user = { ...initial }, writes = 0, session = { id: initial.id, sessionVersion: 0 };
const db = { user: {
  findFirst: async ({ where }) => (where.token === user.token || where.id === user.id) ? user : null,
  update: async ({ where, data, select }) => {
    assert.equal(where.id, initial.id);
    assert.deepEqual(Object.keys(data).sort(), data.email ? ['email', 'emailVerified', 'name'] : ['name']);
    if (data.email === 'taken@example.invalid') throw { code: 'P2002' };
    writes++;
    user = { ...user, ...data };
    return Object.fromEntries(Object.keys(select).map(key => [key, user[key]]));
  },
} };
const auth = load('src/middleware/apiAuthMiddleware.ts', {
  '../lib/prisma': { prisma: db }, '../lib/access': access,
  'next-auth/jwt': { getToken: async () => session },
}).default;
const handler = load('src/pages/api/profile.ts', {
  '@/lib/prisma': { prisma: db }, '@/lib/access': access,
  '@/middleware/apiAuthMiddleware': defaults(auth),
  bcrypt: defaults({ compare: async (plain, hash) => plain === 'correct-password' && hash === 'stored-hash' }),
}).default;
const origin = 'https://dashboard.example.invalid';
process.env.NEXTAUTH_URL = origin;
async function request(method, body, options = {}) {
  const res = { code: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.code = n; return this; }, json(v) { this.body = v; return this; }, end() { return this; } };
  await handler({ method, body, query: { id: 'another-user' }, headers: { origin, ...options.headers } }, res);
  return res;
}
(async () => {
  let res = await request('GET');
  assert.equal(res.code, 200); assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.deepEqual(Object.keys(res.body).sort(), ['email', 'id', 'name', 'token']);
  assert.equal(res.body.id, initial.id); assert.equal(res.body.token, initial.token);
  session = null; assert.equal((await request('GET')).code, 401);
  assert.equal((await request('GET', null, { headers: { authorization: 'Bearer invalid' } })).code, 401);
  assert.equal((await request('GET', null, { headers: { authorization: 'Bearer own-token' } })).code, 200);
  session = { id: initial.id, sessionVersion: 0 };
  user.isActive = false; assert.equal((await request('GET')).code, 403); user.isActive = true;
  user.approvalStatus = 'PENDING'; assert.equal((await request('GET')).code, 403); user.approvalStatus = 'APPROVED';
  session.sessionVersion = -1; assert.equal((await request('GET')).code, 401); session.sessionVersion = 0;
  assert.equal((await request('PATCH', { name: 'Changed', email: user.email }, { headers: { origin: 'https://foreign.invalid' } })).code, 403);
  for (const extra of [{ id: 'another-user' }, { role: 'ADMIN' }, { token: 'replacement-token' }, { isActive: true }]) {
    assert.equal((await request('PATCH', { name: 'Changed', email: user.email, ...extra })).code, 400);
  }
  assert.equal((await request('PATCH', { name: ' ', email: user.email })).code, 400);
  assert.equal((await request('PATCH', { name: 'Changed', email: 'bad-email' })).code, 400);
  assert.equal((await request('PATCH', { name: 'Changed', email: 'new@example.invalid' })).code, 400);
  assert.equal((await request('PATCH', { name: 'Changed', email: 'new@example.invalid', currentPassword: 'wrong' })).code, 400);
  assert.equal(writes, 0);
  res = await request('PATCH', { name: '  Updated name  ', email: ' USER@EXAMPLE.INVALID ' });
  assert.equal(res.code, 200); assert.equal(res.body.name, 'Updated name'); assert.equal(res.body.email, initial.email);
  assert.equal(res.body.token, initial.token); assert.equal(user.password, initial.password);
  res = await request('PATCH', { name: 'Updated name', email: 'new@example.invalid', currentPassword: 'correct-password' });
  assert.equal(res.code, 200); assert.equal(res.body.email, 'new@example.invalid'); assert.equal(user.emailVerified, null);
  assert.equal((await request('PATCH', { name: user.name, email: 'taken@example.invalid', currentPassword: 'correct-password' })).code, 409);
  assert.equal((await request('PATCH', { name: user.name, email: access.SUPER_ADMIN_EMAIL, currentPassword: 'correct-password' })).code, 409);
  user.email = access.SUPER_ADMIN_EMAIL; user.role = 'ADMIN';
  assert.equal((await request('PATCH', { name: user.name, email: 'replacement@example.invalid', currentPassword: 'correct-password' })).code, 409);
  assert.equal((await request('PATCH', { name: 'Admin name', email: access.SUPER_ADMIN_EMAIL })).code, 200);
  res = await request('DELETE'); assert.equal(res.code, 405); assert.equal(res.headers.Allow, 'GET, PATCH');
  console.log('USER_PROFILE_OK: owner isolation, token display, authentication/session/origin checks, input allowlist, password-confirmed email changes, unique email and primary admin protection.');
})().catch(error => { console.error(error); process.exitCode = 1; });
