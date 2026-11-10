'use strict';
// Synthetic records only; no database, network, or WhatsApp access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file, mocks = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', code)(key => key in mocks ? mocks[key] : require(key), module, module.exports);
  return module.exports;
}
const policySort = load('src/lib/phonePolicySort.ts');
const search = load('src/lib/phoneSearchState.ts', { './phonePolicySort': policySort });
const phones = ['a', 'b', 'c', 'd', 'excluded', 'foreign'].map(id => ({
  id, userId: id === 'foreign' ? 'other' : 'owner', name: id === 'excluded' ? 'Other' : 'Match',
}));
const dispatches = [
  { phoneId: 'a', senderPhoneId: null, count: 2 },
  { phoneId: 'b', senderPhoneId: 'a', count: 10 },
  { phoneId: 'a', senderPhoneId: 'c', count: 3 },
  { phoneId: 'c', senderPhoneId: null, count: 9 },
  { phoneId: 'excluded', senderPhoneId: null, count: 99 },
  { phoneId: 'foreign', senderPhoneId: null, count: 999 },
];
let allReads = 0;
const db = {
  phone: {
    findMany: async args => {
      let rows = phones.filter(p => p.userId === args.where.userId &&
        (!args.where.OR || args.where.OR.some(c => c.name && p.name.includes(c.name.contains))) &&
        (!args.where.id || args.where.id.in.includes(p.id)));
      if (args.select) { allReads++; return rows.map(p => ({ id: p.id })); }
      if (args.take) rows = rows.slice(args.skip, args.skip + args.take);
      return [...rows].reverse(); // Database return order must not affect computed sorting.
    },
    count: async () => 4,
  },
  waDispatch: { groupBy: async args => {
    if (args.where.status !== 'QUEUED') return [];
    assert.equal(args.where.userId, 'owner');
    assert.deepEqual(args.where.createdAt, { today: '2026-11-03' });
    const ids = args.where.OR[0].senderPhoneId.in;
    assert(!ids.includes('foreign'));
    return dispatches.filter(d => ids.includes(d.senderPhoneId || d.phoneId))
      .map(d => ({ ...d, _count: { _all: d.count } }));
  } },
};
const handler = load('src/pages/api/phones/index.ts', {
  '@/server/dispatch/settings': { getDispatchDisplayWindow: async () => ({ days: 7, createdAt: {} }) },
  '@/lib/tableQuery': load('src/lib/tableQuery.ts'),
  '@/lib/access': { isSuperAdmin: () => false, phoneScope: u => ({ userId: u.id }), phoneRecordScope: u => ({ userId: u.id }) },
  '@/lib/prisma': { prisma: db },
  '@/middleware/apiAuthMiddleware': { __esModule: true, default: fn => fn },
  '@/server/deviceWebhook/events': {},
  '@/server/phoneConnectionInfo': { getPhoneConnectionInfo: async () => ({ state: 'online' }) },
  '@/lib/phonePolicySort': policySort,
  '@/server/messaging/phonePolicySort': {},
  '@/server/messaging/safety': { usageDay: () => '2026-11-03' },
  '@/lib/dispatchDateFilter': { dispatchDateFilter: (from, to) => { assert.equal(from, to); return { today: from }; } },
  '@/lib/messagingChannel': {},
}).default;
async function request(query) {
  const res = { setHeader() {}, json(body) { this.body = body; return this; } };
  await handler({ method: 'GET', user: { id: 'owner' }, query: { name: 'Match', ...query } }, res);
  return res.body;
}
(async () => {
  for (const order of ['asc', 'desc']) {
    const state = search.readPhoneSearchState({ sort: 'pendingToday', order });
    assert.equal(state.table.sort, 'pendingToday');
    assert.deepEqual(search.readPhoneSearchState(search.phoneSearchQuery(state)), state);
    const pages = await Promise.all([1, 2].map(page => request({ page: String(page), limit: '2', sort: 'pendingToday', order })));
    assert.deepEqual(pages.flatMap(p => p.data.map(d => d.id)), order === 'asc' ? ['b', 'd', 'a', 'c'] : ['a', 'c', 'b', 'd']);
    assert(pages.every(p => p.total === 4));
    assert.deepEqual(pages.flatMap(p => p.data.map(d => d.pendingToday)), order === 'asc' ? [0, 0, 12, 12] : [12, 12, 0, 0]);
  }
  assert.equal((await request({ page: '99', sort: 'pendingToday' })).data.length, 0);
  const before = allReads;
  await request({ page: '1', sort: 'name', order: 'asc' });
  assert.equal(allReads, before, 'Native sorting keeps database pagination');
  console.log('PHONE_PENDING_SORT_PASSED: numeric order, stable ties, pagination, scope, sender attribution, date filter, URL state and native sorting');
})().catch(error => { console.error(error); process.exitCode = 1; });
