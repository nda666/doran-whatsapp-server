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
const admin = { id: 'main-admin', email: access.SUPER_ADMIN_EMAIL, role: 'ADMIN', approvalStatus: 'APPROVED', isActive: true, token: 'admin-fixture-token' };
const records = [
  { id: 'user-a', name: 'User A', email: 'a@example.invalid', role: 'USER', approvalStatus: 'APPROVED', token: 'user-a-fixture-token', password: 'private-password-hash' },
  { id: 'user-b', name: 'User B', email: 'b@example.invalid', role: 'USER', approvalStatus: 'PENDING', token: 'user-b-fixture-token', password: 'private-password-hash' },
];
let actor = admin, reads = 0;
const db = { phone: { findMany: async () => [] }, user: {
  findFirst: async ({ where }) => actor && where.token === actor.token ? actor : null,
  findMany: async ({ select }) => {
    reads++; assert.equal(select.token, true); assert(!select.password);
    return records.map(record => Object.fromEntries(Object.keys(select).map(key => [key, record[key]])));
  },
  count: async () => records.length,
} };
const auth = load('src/middleware/apiAuthMiddleware.ts', {
  '../lib/prisma': { prisma: db }, '../lib/access': access, 'next-auth/jwt': { getToken: async () => null },
}).default;
const guard = load('src/middleware/apiSuperAdminMiddleware.ts', {
  '../lib/access': access, './apiAuthMiddleware': defaults(auth),
}).default;
const handler = load('src/pages/api/admin/users.ts', {
  '@/lib/prisma': { prisma: db }, '@/lib/access': access,
  '@/middleware/apiSuperAdminMiddleware': defaults(guard),
  '@/lib/tableQuery': load('src/lib/tableQuery.ts'), '@/server/libs/socket': { getSocketIO: {} },
}).default;
async function request(token) {
  const res = { code: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(n) { this.code = n; return this; }, json(v) { this.body = v; return this; }, end() { return this; } };
  await handler({ method: 'GET', query: {}, headers: token ? { authorization: `Bearer ${token}` } : {} }, res);
  return res;
}
(async () => {
  const res = await request(admin.token);
  assert.equal(res.code, 200); assert.equal(res.headers['Cache-Control'], 'no-store');
  assert.equal(res.body.total, 2);
  assert.deepEqual(res.body.data.map(row => row.token), records.map(row => row.token));
  assert(res.body.data.every(row => !Object.hasOwn(row, 'password')));
  for (const denied of [records[0], { ...records[0], role: 'ADMIN' }, { ...admin, isActive: false }, { ...admin, approvalStatus: 'PENDING' }]) {
    actor = denied;
    assert.equal((await request(actor.token)).code, 403);
    assert.equal(reads, 1, 'Denied callers must not read user tokens');
  }
  actor = null;
  assert.equal((await request()).code, 401);
  assert.equal((await request('invalid')).code, 401);
  assert.equal(reads, 1);
  console.log('ADMIN_USER_TOKEN_OK: primary admin can read each user token; passwords excluded; ordinary users, other admins, inactive/unapproved accounts and anonymous callers denied.');
})().catch(error => { console.error(error); process.exitCode = 1; });
