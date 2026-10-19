const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { createRequire } = require('node:module');
const path = require('node:path');
function load(relative, stubs = {}) {
  const filename = path.resolve(__dirname, '..', relative), module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const real = createRequire(filename);
  new Function('require', 'module', 'exports', source)(name => Object.hasOwn(stubs, name) ? stubs[name] : real(name), module, module.exports);
  return module.exports;
}
const access = load('src/lib/access.ts');
const user = { id: 'owner', role: 'USER', approvalStatus: 'APPROVED', email: 'owner@example.com' };
const admin = { ...user, id: 'admin', role: 'ADMIN', email: 'admin@gmail.com' };
const id1 = '11111111-1111-4111-8111-111111111111', id2 = '22222222-2222-4222-8222-222222222222', id3 = '33333333-3333-4333-8333-333333333333';
let rows, failId, updates;
function reset() { rows = [{ id: id1, userId: 'owner', token: 'old1' }, { id: id2, userId: 'owner', token: 'old2' }, { id: id3, userId: 'other', token: 'old3' }]; failId = undefined; updates = 0; }
const matches = (row, where) => (!where.userId || row.userId === where.userId) && (!where.id || (typeof where.id === 'string' ? row.id === where.id : where.id.in.includes(row.id)));
const prisma = { $transaction: async fn => {
  const draft = rows.map(row => ({ ...row }));
  const tx = { $queryRaw: async () => [], deviceWebhookSetting: { findUnique: async () => null }, phone: {
    findFirst: async ({ where }) => { const row = draft.find(row => matches(row, where)); return row ? { ...row } : null; },
    findUniqueOrThrow: async ({ where }) => ({ ...draft.find(row => matches(row, where)) }),
    findMany: async ({ where }) => draft.filter(row => matches(row, where)).map(({ id }) => ({ id })),
    updateMany: async ({ where, data }) => {
      updates++;
      if (where.id === failId) throw new Error('Simulated database failure');
      const found = draft.filter(row => matches(row, where)); found.forEach(row => Object.assign(row, data)); return { count: found.length };
    },
  } };
  const result = await fn(tx); rows = draft; return result;
} };
const handler = load('src/pages/api/phones/generate-token.ts', {
  '@/lib/prisma': { prisma }, '@/lib/access': access,
  '@/server/deviceWebhook/events': load('src/server/deviceWebhook/events.ts'),
  '@/middleware/apiAuthMiddleware': { __esModule: true, default: fn => fn },
}).default;
async function run(body, account = user, method = 'POST') {
  const res = { code: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, end() { return this; } };
  await handler({ method, body, user: account }, res); assert.equal(res.headers['Cache-Control'], 'no-store'); return res;
}
(async () => {
  reset(); let res = await run({ scope: 'selected', ids: [id1] }); assert.equal(res.body.count, 1); assert.notEqual(rows[0].token, 'old1'); assert.equal(rows[1].token, 'old2');
  reset(); res = await run({ scope: 'selected', ids: [id1, id2, id1] }); assert.equal(res.body.count, 2); assert.equal(new Set(rows.map(row => row.token)).size, 3); assert.equal(rows[2].token, 'old3');
  reset(); res = await run({ scope: 'all' }); assert.equal(res.body.count, 2); assert.equal(rows[2].token, 'old3');
  reset(); res = await run({ scope: 'all' }, admin); assert.equal(res.body.count, 3); assert(rows.every(row => !row.token.startsWith('old')));
  reset(); res = await run({ scope: 'all' }, { ...admin, email: 'other-admin@example.com' }); assert.equal(res.body.count, 0);
  for (const ids of [[id1, id3], [id1, '44444444-4444-4444-8444-444444444444']]) {
    reset(); res = await run({ scope: 'selected', ids }); assert.equal(res.code, 409); assert.equal(updates, 0); assert.equal(rows[0].token, 'old1');
  }
  for (const body of [{}, { scope: 'selected', ids: [] }, { scope: 'selected', ids: ['invalid'] }, { scope: 'all', ids: [id1] }, { scope: 'selected', ids: Array(1001).fill(id1) }]) {
    reset(); assert.equal((await run(body)).code, 400); assert.equal(updates, 0);
  }
  reset(); assert.equal((await run({ scope: 'all' }, admin, 'GET')).code, 405); assert.equal(updates, 0);
  reset(); failId = id2; await assert.rejects(run({ scope: 'selected', ids: [id1, id2] }), /Simulated database failure/); assert.equal(rows[0].token, 'old1');
  console.log('PHONE_TOKEN_OK: single, selected, all, unique credentials, owner/admin scopes, validation, atomic failure; no real tokens changed');
})().catch(error => { console.error(error); process.exitCode = 1; });
