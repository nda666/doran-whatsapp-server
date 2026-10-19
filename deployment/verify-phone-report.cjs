const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const fixtures = [
  { phoneId: 'a', userId: 'owner', status: 'SENT', createdAt: '2026-10-01T00:00:00Z', sentAt: '2026-10-17T17:00:00Z' },
  { phoneId: 'a', userId: 'owner', status: 'DELIVERED', createdAt: '2026-10-18T00:00:00Z', sentAt: '2026-10-18T16:59:59.999Z' },
  { phoneId: 'a', userId: 'owner', status: 'READ', createdAt: '2026-10-18T00:00:00Z', sentAt: '2026-10-18T17:00:00Z' },
  ...['FAILED', 'QUEUED', 'PROCESSING', 'UNCERTAIN', 'SUPPRESSED'].map(status => ({ phoneId: 'a', userId: 'owner', status, createdAt: '2026-10-18T00:00:00Z' })),
  { phoneId: 'deleted', userId: 'owner', status: 'FAILED', createdAt: '2026-10-18T00:00:00Z' },
  { phoneId: 'private', userId: 'other', status: 'SENT', createdAt: '2026-10-18T00:00:00Z', sentAt: '2026-10-18T00:00:00Z' },
];
const devices = [{ id: 'a', name: '=Device', number: '628123', userId: 'owner' }, { id: 'zero', name: 'No activity', number: '628456', userId: 'owner' }, { id: 'private', name: 'Private', number: '629999', userId: 'other' }];
function matches(row, where) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return value.some(branch => matches(row, branch));
    if (value && typeof value === 'object') {
      if (value.in) return value.in.includes(row[key]);
      if (value.notIn) return !value.notIn.includes(row[key]);
      return row[key] && (!value.gte || new Date(row[key]) >= value.gte) && (!value.lt || new Date(row[key]) < value.lt);
    }
    return row[key] === value;
  });
}
const prisma = {
  waDispatch: { groupBy: async ({ where }) => {
    const groups = new Map();
    for (const row of fixtures.filter(row => matches(row, where))) {
      const key = `${row.phoneId}:${row.status}`;
      if (!groups.has(key)) groups.set(key, { phoneId: row.phoneId, status: row.status, _count: { _all: 0 } });
      groups.get(key)._count._all++;
    }
    return Array.from(groups.values());
  } },
  phone: { findMany: async ({ where }) => devices.filter(row => matches(row, where)) },
};
const cache = new Map();
function load(file) {
  if (file === '@/lib/prisma') return { prisma };
  if (!file.startsWith('@/')) return require(file);
  const filename = path.join(root, 'src', file.slice(2) + '.ts');
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} }; cache.set(filename, module);
  const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } });
  vm.runInThisContext(`(function(require,module,exports){${compiled.outputText}\n})`, { filename })(load, module, module.exports);
  return module.exports;
}
const { phoneReport } = load('@/server/phoneReport');
async function run(query = {}, admin = false) {
  const res = { code: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.code = code; return this; }, json(data) { this.body = data; return this; }, send(data) { this.body = data; return this; } };
  await phoneReport({ user: { id: 'owner', email: admin ? 'admin@gmail.com' : 'owner@example.com', role: admin ? 'ADMIN' : 'USER', approvalStatus: 'APPROVED' }, query: { start: '2026-10-18', end: '2026-10-18', ...query } }, res);
  return res;
}
(async () => {
  const result = (await run({ limit: '1' })).body;
  assert.equal(result.total, 3, 'Includes zero activity and deleted device, excludes other owner');
  assert.equal(result.data.length, 1);
  assert.deepEqual(result.counts, { total: 8, sent: 2, failed: 2, waiting: 2, uncertain: 1, suppressed: 1 });
  assert.equal(result.data[0].phoneId, 'a');
  assert.equal(result.data[0].sent, 2, 'Includes old createdAt with in-period sentAt, excludes next midnight WIB');
  assert.equal((await run({ phoneId: 'private' })).body.total, 0, 'Cannot select another owner');
  assert.equal((await run({ phoneId: 'a' })).body.counts.total, 7);
  assert.equal((await run({ phoneId: 'zero' })).body.data[0].total, 0);
  assert.equal((await run({}, true)).body.counts.sent, 3, 'Admin can see across owners');
  for (const query of [{ start: '2026-02-30' }, { start: '2026-10-19' }, { end: undefined }, { phoneId: ['a', 'private'] }]) assert.equal((await run(query)).code, 400);
  const exported = await run({ export: 'csv', limit: '1' });
  assert.equal(exported.body.split('\r\n').length, 4, 'Exports every row regardless of page');
  assert.ok(exported.body.includes("'=Device"), 'CSV formula is escaped');
  assert.equal((await run({ sort: 'number', order: 'asc', page: '2', limit: '1' })).body.data[0].phoneId, 'a');
  console.log('Phone report: WIB boundaries, send date, all statuses, owner isolation, admin, zero/deleted devices, validation, pagination, sorting and CSV passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
