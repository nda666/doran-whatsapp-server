'use strict';
// Offline fixtures: exercise actual quota calculation and API pagination together.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const path = require('node:path');
const { createRequire } = require('node:module');
function load(file, mocks = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const localRequire = createRequire(path.resolve(file));
  new Function('require', 'module', 'exports', code)(key => key in mocks ? mocks[key] : key.startsWith('.') ? load(path.resolve(path.dirname(file), key + '.ts'), mocks) : localRequire(key), module, module.exports);
  return module.exports;
}
const phones = ['a', 'b', 'c', 'd', 'e', 'foreign'].map(id => ({ id, userId: id === 'foreign' ? 'other' : 'owner', senderGroupId: id === 'e' ? null : 'group', active: 1, isOnline: ['a', 'c', 'foreign'].includes(id) }));
const policies = [
  { phoneId: 'b', dailyLimit: 10, useGlobalQuota: false, warmupStartedAt: null },
  { phoneId: 'c', dailyLimit: 100, useGlobalQuota: true, warmupStartedAt: new Date() },
  { phoneId: 'd', dailyLimit: 5, useGlobalQuota: false, warmupStartedAt: new Date() },
];
const usages = [{ phoneId: 'a', attempts: 100 }, { phoneId: 'b', attempts: 11 }, { phoneId: 'c', attempts: 25 }, { phoneId: 'd', attempts: 4 }, { phoneId: 'foreign', attempts: 999 }];
const matches = (row, where) => Object.entries(where).every(([key, value]) => key === 'AND' ? value.every(clause => matches(row, clause))
  : value && typeof value === 'object' ? value.in.includes(row[key]) : row[key] === value);
let day;
let windows = [], reset = { mode: "midnight", hours: 2 };
const db = {
  phone: {
    findMany: async args => {
      let rows = phones.filter(row => matches(row, args.where));
      if (args.select) return rows.map(({ id }) => ({ id }));
      rows.sort((a, b) => a.id.localeCompare(b.id));
      return args.take ? rows.slice(args.skip, args.skip + args.take) : rows.reverse();
    },
    count: async ({ where }) => phones.filter(row => matches(row, where)).length,
  },
  deviceQuotaWindow: { findMany: async () => windows },
  deviceSendPolicy: { findMany: async ({ where }) => policies.filter(row => where.phoneId.in.includes(row.phoneId)) },
  deviceDailyUsage: { findMany: async ({ where }) => { day = where.day; return usages.filter(row => where.phoneId.in.includes(row.phoneId)); } },
  waDispatch: { groupBy: async () => [] },
};
const safety = load('src/server/messaging/safety.ts', Object.fromEntries([
  '../../lib/dispatchPresentation', '../dispatchWebhook/events', '../../lib/prisma', '../../utils/normalizePhoneRecipient',
  '../../lib/deviceQuota', '../dispatch/settings', '../dispatch/timing',
].map(key => [key, {}])));
const sort = load('src/lib/phonePolicySort.ts');
const service = load('src/server/messaging/phonePolicySort.ts', {
  '../../lib/prisma': { prisma: db }, '../../lib/phonePolicySort': sort,
  '../../lib/deviceQuota': load('src/lib/deviceQuota.ts'), './safety': safety,
  '../../lib/quotaReset': load('src/lib/quotaReset.ts'),
  '../dispatch/settings': { getQuotaReset: async () => reset, getGlobalDeviceQuota: async () => 100, getWarmupDailyLimits: async () => [25, 50], getDispatchDelayRange: async () => ({ minSeconds: 1, maxSeconds: 2 }) },
});
const handler = load('src/pages/api/phones/index.ts', {
  '@/server/messaging/safety': safety,
  '@/lib/dispatchDateFilter': load('src/lib/dispatchDateFilter.ts'),
  '@/server/dispatch/settings': { getDispatchDisplayWindow: async () => ({ days: 1, createdAt: {} }) },
  '@/lib/tableQuery': load('src/lib/tableQuery.ts'), '@/lib/access': { isSuperAdmin: user => user.id === 'admin', phoneScope: user => user.id === 'admin' ? {} : { userId: user.id }, phoneRecordScope: () => ({}) },
  '@/lib/prisma': { prisma: { ...db, user: { findMany: async () => [] } } }, '@/middleware/apiAuthMiddleware': { __esModule: true, default: fn => fn },
  '@/server/deviceWebhook/events': {}, '@/server/phoneConnectionInfo': { getPhoneConnectionInfo: async () => ({}) },
  '@/lib/phonePolicySort': sort, '@/server/messaging/phonePolicySort': service,
}).default;
async function request(query, id = 'owner') {
  let body;
  await handler({ method: 'GET', query: { page: '1', ...query }, user: { id } }, { setHeader() {}, json(value) { body = value; } });
  return body;
}
(async () => {
  let result = await request({ quota_status: 'fulfilled', limit: '2' });
  assert.deepEqual(result.data.map(row => row.id), ['a', 'b']);
  assert.equal(result.total, 3, 'Exact quota, over quota and warmup quota count as fulfilled');
  assert.equal(result.online, 2, 'Online total includes matching devices beyond this page');
  assert.equal(result.offline, 1);
  assert.equal(day, safety.usageDay(), 'Use current WIB day');
  result = await request({ quota_status: 'fulfilled', limit: '2', page: '2' });
  assert.deepEqual(result.data.map(row => row.id), ['c']);
  assert.equal(result.total, 3);
  assert.equal(result.online, 2);
  assert.equal(result.offline, 1);
  result = await request({ quota_status: 'available' });
  assert.deepEqual(result.data.map(row => row.id), ['d', 'e'], 'Custom maximum during warmup and missing usage');
  assert.equal(result.online, 0);
  assert.equal(result.offline, 2);
  result = await request({ quota_status: 'fulfilled', sort: 'quota', order: 'asc' });
  assert.deepEqual(result.data.map(row => row.id), ['b', 'c', 'a'], 'Computed sort uses quota-filtered set');
  assert.equal(result.total, 3);
  assert.equal(result.online, 2, 'Computed sorting preserves filtered online count');
  assert.equal(result.offline, 1);
  assert.equal((await request({ quota_status: 'fulfilled', sender_group: 'none' })).total, 0);
  assert.equal((await request({ quota_status: 'available', sender_group: 'none' })).total, 1);
  assert.equal((await request({ quota_status: 'fulfilled' }, 'admin')).total, 4);
  assert.equal((await request({ quota_status: 'invalid' })).total, 5);
  assert.equal((await request({ quota_status: '' })).total, 5);
  assert.equal((await request({ quota_status: 'fulfilled', page: '9' })).data.length, 0);
  reset = { mode: 'after-full', hours: 2 };
  windows = [{ phoneId: 'e', attempts: 100, startedAt: new Date(Date.now() - 86400000), reachedAt: new Date(), lastAttemptAt: new Date() }];
  assert.equal((await request({ quota_status: 'fulfilled' })).total, 4, 'Cross-day full cycle remains exhausted');
  windows[0].reachedAt = new Date(Date.now() - 2 * 86400000);
  assert.equal((await request({ quota_status: 'fulfilled' })).total, 3, 'Expired cycle is immediately available');
  assert((await request({ quota_status: 'available' })).data.some(row => row.id === 'e'));
  reset = { mode: 'midnight', hours: 2 };
  assert.equal((await request({ quota_status: 'fulfilled' })).total, 3, 'Switching to midnight uses daily consumption');
  policies.push({ phoneId: 'e', dailyLimit: 100, useGlobalQuota: false, warmupStartedAt: null, quotaReset: { mode: 'after-full', hours: 2 } });
  windows[0].reachedAt = new Date();
  assert.equal((await request({ quota_status: 'fulfilled' })).total, 4, 'Per-number hours overrides global midnight');
  policies.pop();
  assert.equal((await request({ quota_status: 'fulfilled' })).total, 3, 'Removing override returns to global');
  const search = load('src/lib/phoneSearchState.ts', { './phonePolicySort': sort });
  for (const quota_status of ['fulfilled', 'available', '']) {
    const state = search.readPhoneSearchState({ quota_status, page: '3', sender_group: 'group', sort: 'quota', order: 'desc' });
    assert.equal(state.filters.quota_status, quota_status);
    assert.deepEqual(search.readPhoneSearchState(search.phoneSearchQuery(state)), state);
  }
  assert.equal(search.readPhoneSearchState({ quota_status: ['fulfilled'] }).filters.quota_status, '');
  assert.equal(search.readPhoneSearchState({ quota_status: 'invalid' }).filters.quota_status, '');
  console.log('PHONE_QUOTA_FILTER_OK: global/custom/warmup limits, WIB day, missing usage/policy, owner scope, combined filters, pagination, sorting and URL state');
})().catch(error => { console.error(error); process.exitCode = 1; });
