'use strict';
// In-memory database and mocked transport. No real WhatsApp messages or DB writes.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { createRequire } = require('node:module'), ts = require('typescript');
function load(relative, stubs = {}) {
  const file = path.resolve(__dirname, '..', relative), real = createRequire(file), module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: 1, target: 7, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', code)(name => Object.hasOwn(stubs, name) ? stubs[name] : real(name), module, module.exports);
  return module.exports;
}
process.env.SETTINGS_ENCRYPTION_KEY = 'synthetic-order-test-key';
const constants = load('src/lib/dispatchSettings.ts'), crypto = load('src/lib/globalSettings.ts');
let stored = null, jobs = [], selected = [], queries = [], filter;
const prisma = {
  globalSetting: { findUnique: async ({ where }) => where.key === constants.DISPATCH_QUEUE_ORDER_KEY ? stored : null },
  phone: { findUnique: async () => ({ active: 1 }) },
  waSenderLease: { updateMany: async () => ({ count: 1 }), findFirst: async () => ({}) },
  campaign: { updateMany: async () => ({ count: 0 }) },
  waDispatch: { findUnique: async ({ where }) => jobs.find(j => j.id === where.id), findFirst: async ({ where, orderBy }) => {
    filter = where;
    const sign = orderBy[0].createdAt === 'desc' ? -1 : 1;
    return jobs.filter(j => j.status === 'QUEUED' && j.createdAt > where.createdAt.gt && j.nextAttemptAt <= new Date() && (!j.campaignId || j.campaign.scheduledAt <= new Date() && ['WAITING', 'PROCESSING'].includes(j.campaign.status) && j.expiresAt > new Date()))
      .sort((a,b) => sign * (a.createdAt-b.createdAt || a.id.localeCompare(b.id)))[0] || null;
  } },
  $transaction: async fn => fn(prisma),
  $queryRaw: async (parts, ...values) => { queries.push({ sql: parts.join('?'), values }); return []; },
};
const settings = load('src/server/dispatch/settings.ts', { '../../lib/prisma': { prisma }, '../../lib/globalSettings': crypto, '../../lib/dispatchSettings': constants });
const events = { updateDispatches: async ({ where, data }) => {
  const job = jobs.find(j => j.id === where.id && j.status === where.status);
  if (!job) return { count: 0 };
  Object.assign(job, data); return { count: 1 };
} };
const socket = { ws: { isOpen: true }, user: { id: 'mock' }, waitForMessage: async () => ({ tag: 'ack', attrs: {} }), sendMessage: async (_, content) => { selected.push(content.text); return { key: { id: 'mock' } }; } };
const worker = load('src/server/dispatch/worker.ts', {
  '../libs/phoneMaintenance': { phoneMaintenance: new Set() }, './acknowledgement': { waitForDispatchAcknowledgement: (wait, id) => wait(id, 40000) }, './retry': load('src/server/dispatch/retry.ts'), './receipts': { recordDispatchReceipt: async () => {} },
  '../../lib/prisma': { prisma }, '../../lib/dispatchSettings': constants, './settings': settings,
  './timing': { delayMinMs: 0, delayMaxMs: 0, randomDispatchDelay: () => 0 },
  '../dispatchWebhook/events': events, '../libs/makeWASocket': { session: new Map([['phone', socket]]) },
  '@whiskeysockets/baileys': { generateMessageIDV2: () => 'mock' }, './media': {}, '../campaigns/media': {}, '../campaigns/content': {},
});
function reset() {
  const now = Date.now();
  jobs = [
    { id: 'older', createdAt: new Date(now-30000), attempts: 4, message: 'older' },
    { id: 'newer', createdAt: new Date(now-10000), attempts: 0, message: 'newer' },
    { id: 'future', createdAt: new Date(now), attempts: 0, message: 'future', nextAttemptAt: new Date(now+3600000) },
    { id: 'expired', createdAt: new Date(now-2*86400000), attempts: 0, message: 'expired' },
  ].map(j => ({ status: 'QUEUED', nextAttemptAt: new Date(0), campaignId: null, recipient: 'mock', ...j }));
}
const row = { id: '22222222-2222-4222-8222-222222222222', key: constants.DISPATCH_QUEUE_ORDER_KEY, label: constants.DISPATCH_QUEUE_ORDER_LABEL, value: crypto.encryptSetting('oldest') };
const api = load('src/pages/api/admin/global-settings.ts', {
  '@/lib/prisma': { prisma: { globalSetting: { createMany: async () => ({ count: 0 }), findMany: async () => [row], findUnique: async () => row, update: async ({ data }) => Object.assign(row, data) } } },
  '@/lib/globalSettings': crypto, '@/lib/dispatchSettings': constants, '@/middleware/apiSuperAdminMiddleware': fn => fn,
}).default;
async function request(value) {
  const res = { code: 200, setHeader() {}, status(c) { this.code=c; return this; }, json(body) { this.body=body; return this; } };
  await api({ method: 'PATCH', body: { id: row.id, label: row.label, value } }, res); return res;
}
(async () => {
  assert.equal(await settings.getDispatchQueueOrder(), 'oldest');
  for (const v of ['', 'asc', 'desc', 'NEWEST', 'random']) { assert.equal(constants.parseDispatchQueueOrder(v), null); assert.equal((await request(v)).code, 400); }
  reset(); await worker.processPhone('phone'); assert.equal(selected.at(-1), 'older');
  assert(filter.AND.length === 3 && filter.createdAt.gt instanceof Date);
  const oldestSql = await poll(); assert.equal(oldestSql, 'MIN(d.createdAt) ASC');
  assert.equal((await request('newest')).code, 200); stored = { value: row.value };
  reset(); await worker.processPhone('phone'); assert.equal(selected.at(-1), 'newer');
  assert.equal(await poll(), 'MAX(d.createdAt) DESC');
  assert.equal((await request('oldest')).code, 200); stored = { value: row.value };
  reset(); await worker.processPhone('phone'); assert.equal(selected.at(-1), 'older');
  stored = { value: crypto.encryptSetting('invalid') }; await assert.rejects(settings.getDispatchQueueOrder(), /Invalid dispatch/);
  console.log('DISPATCH_ORDER_MOCK_TESTS_PASSED: oldest/newest selection, live setting reload, eligible filters, sender ranking, API validation; no real messages');
})().catch(e => { console.error(e); process.exitCode=1; });
async function poll() {
  queries=[]; const stop = worker.startDispatchWorker();
  await new Promise(resolve => setTimeout(resolve, 30)); await stop();
  const query = queries.find(q => q.sql.includes('JOIN wa_sender_leases'));
  assert(query); return query.values.find(v => v && typeof v.sql === 'string').sql;
}
