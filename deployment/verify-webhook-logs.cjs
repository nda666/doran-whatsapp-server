const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { Prisma } = require('@prisma/client');
let queries = [], detailArgs;
const db = {
  $queryRaw: query => { queries.push(query); return Promise.resolve(query.sql.includes('COUNT(*)') ? [{ total: 45n }] : []); },
  $transaction: promises => Promise.all(promises),
  dispatchWebhookEvent: { findUnique: async args => { detailArgs = args; return { id: 1, payload: null }; } },
  deviceWebhookEvent: { findUnique: async args => { detailArgs = args; return null; } },
};
const moduleObj = { exports: {} };
const source = ts.transpileModule(fs.readFileSync('src/pages/api/admin/webhook-logs.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
new Function('require', 'module', 'exports', source)(name => {
  if (name === '@/lib/prisma') return { prisma: db };
  if (name === '@/lib/access') return { isSuperAdmin: user => user.main === true };
  if (name === '@/middleware/apiSuperAdminMiddleware') return { default: fn => fn };
  return require(name);
}, moduleObj, moduleObj.exports);
async function request(query = {}, method = 'GET', main = true) {
  const res = { code: 200, headers: {}, setHeader(k,v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, end() {} };
  await moduleObj.exports.default({ user: { main }, method, query }, res); return res;
}
(async () => {
  assert.equal((await request({}, 'GET', false)).code, 403);
  assert.equal((await request({}, 'POST')).code, 405);
  for (const query of [{ type: 'invalid' }, { page: '0' }, { limit: '101' }, { id: '1' }, { status: 'SENT' }, { from: 'invalid' }, { q: ['a','b'] }, { from: '2026-10-12T00:00:00.000Z', to: '2026-10-11T00:00:00.000Z' }]) assert.equal((await request(query)).code, 400);
  queries = [];
  const combined = await request({ q: "x%' OR 1=1 --", page: '3', limit: '10' });
  assert.equal(combined.body.total, 45); assert.equal(combined.headers['Cache-Control'], 'no-store');
  assert(queries.every(query => query.sql.includes('UNION ALL')));
  assert(!queries[1].sql.includes("x%'")); assert(queries[1].values.includes("%x!%' OR 1=1 --%"));
  assert.deepEqual(queries[1].values.slice(-2), [10, 20]);
  queries = [];
  await request({ type: 'device', status: 'FAILED', from: '2026-10-11T00:00:00.000Z' });
  assert(!queries[1].sql.includes('dispatch_webhook_events')); assert(queries[1].values.includes('FAILED')); assert(queries[1].values.some(value => value instanceof Date));
  assert.equal((await request({ type: 'device', id: '1' })).code, 404);
  assert.equal((await request({ type: 'dispatch', id: '1' })).code, 200);
  assert(!detailArgs.select.leaseToken); assert(!detailArgs.select.secret); assert(detailArgs.select.payload);
  assert.equal((await request({ sort: 'createdAt DESC; DROP TABLE users' })).code, 400);
  assert.equal((await request({ order: 'invalid' })).code, 400);
  for (const sort of ['createdAt', 'type', 'event', 'eventId', 'referenceId', 'status', 'attempts', 'lastError']) {
    queries = []; await request({ sort, order: 'asc', limit: '5' });
    assert(queries[1].sql.includes(`ORDER BY ${sort} ASC, createdAt DESC, type ASC, id DESC`));
  }
  console.log('WEBHOOK_LOGS_VALIDATION_ACCESS_PARAMETERIZED_FILTERS_PAGINATION_DETAIL_PASSED');
})().catch(error => { console.error(error); process.exitCode = 1; });
