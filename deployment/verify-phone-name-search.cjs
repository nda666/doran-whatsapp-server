const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const fixtures = [
  { id: 'device', userId: 'owner', name: 'Doran Bali', account_name: 'Other', number: '6281', isOnline: false, active: 1 },
  { id: 'account', userId: 'owner', name: 'Device 2', account_name: 'Doran WhatsApp', number: '6281', isOnline: false, active: 1 },
  { id: 'other-owner', userId: 'other', name: 'Other', account_name: 'Doran WhatsApp', number: '6281', isOnline: false, active: 1 },
  { id: 'online', userId: 'owner', name: 'Other', account_name: 'Doran WhatsApp', number: '6281', isOnline: true, active: 1 },
  { id: 'unmatched', userId: 'owner', name: 'Other', account_name: null, number: '6281', isOnline: false, active: 1 },
];
function matches(row, where) {
  return Object.entries(where).every(([key, value]) => key === 'OR'
    ? value.some(clause => matches(row, clause))
    : value && typeof value === 'object'
      ? typeof row[key] === 'string' && row[key].includes(value.contains)
      : row[key] === value);
}
let dataWhere;
const modules = {
  '@/lib/tableQuery': { tableQuery: () => ({ page: 1, limit: 10, skip: 0, orderBy: { name: 'asc' } }) },
  '@/lib/access': { ownerScope: user => ({ userId: user.id }) },
  '@/lib/prisma': { prisma: {
    phone: {
      findMany: async ({ where }) => { dataWhere = where; return fixtures.filter(row => matches(row, where)); },
      count: async ({ where }) => { assert.deepEqual(where, dataWhere); return fixtures.filter(row => matches(row, where)).length; },
    },
    waDispatch: { groupBy: async () => [] },
  } },
  '@/middleware/apiAuthMiddleware': { default: handler => handler },
  zod: require('zod'),
};
const compiled = ts.transpileModule(fs.readFileSync('src/pages/api/phones/index.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const exportsObject = {};
vm.runInNewContext(compiled.outputText, { exports: exportsObject, require: name => {
  assert.ok(modules[name], name); return modules[name];
} });
async function search(query) {
  let result;
  await exportsObject.default({ method: 'GET', user: { id: 'owner' }, query: { page: '1', ...query } }, { setHeader() {}, json: data => { result = data; } });
  return result;
}
(async () => {
  const result = await search({ name: 'Doran', number: '6281', is_online: '0', active: '1' });
  assert.deepEqual(result.data.map(row => row.id), ['device', 'account']);
  assert.equal(result.total, 2);
  const all = await search({ name: '' });
  assert.equal(all.total, 4);
  assert.ok(!('OR' in dataWhere));
  const none = await search({ name: 'Missing' });
  assert.equal(none.total, 0);
  console.log('PHONE_NAME_OR_ACCOUNT_SEARCH_SCOPE_AND_FILTERS_OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
