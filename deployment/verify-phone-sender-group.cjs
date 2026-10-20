const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText,
    { exports, require: key => { assert(key in mocks, key); return mocks[key]; } });
  return exports;
}
const groups = [{ id: 'group-a', userId: 'owner', name: 'Store A', enabled: false }, { id: 'group-b', userId: 'other', name: 'Store B', enabled: true }];
const phones = [
  { id: 'one', userId: 'owner', senderGroupId: 'group-a', name: 'Nota', number: '6281', isOnline: true, active: 1 },
  { id: 'two', userId: 'owner', senderGroupId: null, name: 'Nota', number: '6282', isOnline: false, active: 1 },
  { id: 'three', userId: 'other', senderGroupId: 'group-b', name: 'Nota', number: '6283', isOnline: true, active: 1 },
];
const matches = (row, where) => Object.entries(where).every(([key, value]) => key === 'OR' ? value.some(clause => matches(row, clause))
  : value && typeof value === 'object' ? String(row[key] || '').includes(value.contains) : row[key] === value);
const plain = value => JSON.parse(JSON.stringify(value));
let lastQuery, lastCount;
const access = { isSuperAdmin: user => user.id === 'admin', ownerScope: user => user.id === 'admin' ? {} : { userId: user.id } };
const handler = load('src/pages/api/phones/index.ts', {
  '@/server/dispatch/settings': { getDispatchDisplayWindow: async () => ({ days: 1, createdAt: {} }) },
  '@/lib/tableQuery': load('src/lib/tableQuery.ts', {}), '@/lib/access': access,
  '@/lib/prisma': { prisma: {
    phone: { findMany: async query => { lastQuery = query; return phones.filter(row => matches(row, query.where)).map(row => ({ ...row, senderGroup: groups.find(group => group.id === row.senderGroupId) || null })); },
      count: async ({ where }) => { lastCount = where; return phones.filter(row => matches(row, where)).length; } },
    senderGroup: { findMany: async ({ where, select }) => groups.filter(row => matches(row, where)).map(row => Object.fromEntries(Object.keys(select).map(key => [key, row[key]]))) },
    waDispatch: { groupBy: async () => [] },
  } },
  '@/middleware/apiAuthMiddleware': { __esModule: true, default: handler => handler },
  '@/server/deviceWebhook/events': {}, '@/server/phoneConnectionInfo': { getPhoneConnectionInfo: async () => ({}) },
  '@/lib/phonePolicySort': { isPhonePolicySort: () => false }, '@/server/messaging/phonePolicySort': {}, zod: require('zod'),
}).default;
async function request(query, id = 'owner') {
  let result;
  await handler({ method: 'GET', user: { id }, query: { page: '1', ...query } }, { setHeader() {}, json: value => { result = value; } });
  return result;
}
(async () => {
  let result = await request({ sender_group: 'group-a', name: 'Nota', is_online: '1', active: '1' });
  assert.deepEqual(plain(result.data.map(row => row.id)), ['one']);
  assert.equal(result.data[0].senderGroup.name, 'Store A');
  assert.equal(result.data[0].senderGroup.enabled, false, 'Disabled group membership remains visible');
  assert.deepEqual(plain(lastQuery.where), plain(lastCount));
  assert.deepEqual(plain(lastQuery.include.senderGroup.select), { id: true, name: true, enabled: true });
  result = await request({ sender_group: 'none' });
  assert.deepEqual(plain(result.data.map(row => row.id)), ['two']);
  assert.equal((await request({ sender_group: 'group-b' })).total, 0, 'Foreign group filter cannot bypass owner scope');
  assert.equal((await request({ sender_group: '' })).total, 2);
  assert.equal((await request({ sender_group: 'group-b' }, 'admin')).total, 1);
  const options = await request({ sender_group_options: '1' });
  assert.deepEqual(plain(options), [{ id: 'group-a', name: 'Store A', enabled: false }]);
  assert.equal((await request({ sender_group_options: '1' }, 'admin')).length, 2);
  for (const order of ['asc', 'desc']) {
    await request({ sort: 'senderGroup.name', order });
    assert.deepEqual(plain(lastQuery.orderBy), [{ senderGroup: { name: order } }, { id: 'asc' }]);
  }
  const policySort = load('src/lib/phonePolicySort.ts', {});
  const search = load('src/lib/phoneSearchState.ts', { './phonePolicySort': policySort });
  for (const sender_group of ['none', 'group-a', '']) {
    const state = search.readPhoneSearchState({ sender_group, page: '3', sort: 'senderGroup.name', order: 'asc' });
    assert.equal(state.filters.sender_group, sender_group);
    assert.deepEqual(plain(search.readPhoneSearchState(search.phoneSearchQuery(state))), plain(state));
  }
  console.log('PHONE_SENDER_GROUP_OK: group/none/all filters, combined filters, disabled groups, owner scope, options, sorting, URL round trip');
})().catch(error => { console.error(error); process.exitCode = 1; });
