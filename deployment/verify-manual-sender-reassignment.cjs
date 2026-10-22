'use strict';
// Mock database and sockets only; no WhatsApp messages or real queue mutations.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
const sourceId = '11111111-1111-4111-8111-111111111111';
const targetId = '22222222-2222-4222-8222-222222222222';
const foreignId = '33333333-3333-4333-8333-333333333333';
const now = new Date(), day = 86400000;
const source = { id: sourceId, userId: 'owner', name: 'WA-1', number: '6281234567890', active: 1, status: 'CLOSED', senderGroupId: null };
const target = { ...source, id: targetId, name: 'WA-2', number: '6281234567891', status: 'OPEN' };
const foreign = { ...target, id: foreignId, userId: 'other' };
const phones = [source, target, foreign];
const socket = { ws: { isOpen: true }, user: { id: 'mock' } };
const sessions = new Map([[targetId, socket], [foreignId, socket]]);
let jobs = [], policy = null, usage = { attempts: 10, failures: 0 }, window = null, leaseAvailable = true;
const matches = (row, where = {}) => Object.entries(where).every(([key, value]) => {
  if (key === 'AND') return value.every(v => matches(row, v));
  if (key === 'OR') return value.some(v => matches(row, v));
  if (key === 'sendAttempts') return !(row.sendAttempts || []).some(attempt => matches(attempt, value.none));
  const actual = row[key];
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    if (['campaign'].includes(key)) return actual != null && matches(actual, value);
    return Object.entries(value).every(([op, expected]) => ({
      not: () => actual !== expected, in: () => expected.includes(actual), notIn: () => actual != null && !expected.includes(actual),
      gt: () => actual > expected, gte: () => actual >= expected, lt: () => actual < expected, lte: () => actual <= expected,
    })[op]());
  }
  return actual === value;
});
const db = {
  phone: { findFirst: async ({ where }) => phones.find(p => matches(p, where)), findMany: async ({ where }) => phones.filter(p => matches(p, where)), count: async () => phones.length },
  deviceSendPolicy: { findUnique: async () => policy }, deviceDailyUsage: { findUnique: async () => usage }, deviceQuotaWindow: { findUnique: async () => window },
  waSenderLease: { createMany: async () => ({ count: 1 }), updateMany: async () => ({ count: Number(leaseAvailable) }) },
  waDispatch: {
    count: async ({ where }) => jobs.filter(j => matches(j, where)).length,
    updateMany: async ({ where, data }) => { const found = jobs.filter(j => matches(j, where)); found.forEach(j => Object.assign(j, data)); return { count: found.length }; },
    groupBy: async ({ by, where }) => {
      const groups = new Map();
      for (const row of jobs.filter(j => matches(j, where))) {
        const key = JSON.stringify(by.map(field => row[field]));
        if (!groups.has(key)) groups.set(key, { ...Object.fromEntries(by.map(field => [field, row[field]])), _count: { _all: 0 } });
        groups.get(key)._count._all++;
      }
      return [...groups.values()];
    },
  },
};
const stubs = {
  'src/lib/prisma.ts': { prisma: db },
  'src/middleware/apiAuthMiddleware.ts': { default: handler => handler, __esModule: true },
  'src/server/libs/makeWASocket.ts': { session: sessions },
  'src/server/libs/phoneMaintenance.ts': { phoneMaintenance: new Set() },
  'src/server/deviceWebhook/events.ts': {}, 'src/server/dispatchWebhook/events.ts': {},
  'src/server/phoneConnectionInfo.ts': { getPhoneConnectionInfo: async () => ({ state: 'online' }) },
  'src/server/messaging/phonePolicySort.ts': {},
  'src/server/dispatch/settings.ts': {
    getDispatchAgeCutoff: async () => new Date(now - 7 * day), getGlobalDeviceQuota: async () => 200,
    getWarmupDailyLimits: async () => [25, 50, 100], getQuotaReset: async () => ({ mode: 'midnight', hours: 24 }),
    getGlobalOperatingHours: async () => ({ enabled: false }),
    getDispatchDisplayWindow: async () => ({ days: 7, createdAt: { gt: new Date(now - 7 * day) } }),
  },
};
const cache = {};
function load(file) {
  if (stubs[file]) return stubs[file];
  if (cache[file]) return cache[file];
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: 1, target: 7, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', code)(spec => {
    if (spec.startsWith('@/')) return load('src/' + spec.slice(2) + '.ts');
    if (spec.startsWith('.')) return load(path.posix.normalize(path.posix.join(path.posix.dirname(file), spec)) + '.ts');
    return require(spec);
  }, mod, mod.exports);
  return cache[file] = mod.exports;
}
const reassignment = load('src/server/dispatch/reassignment.ts');
const routing = load('src/server/dispatch/senderRouting.ts');
const handler = load('src/pages/api/phones/[id]/reassign-sender.ts').default;
const list = load('src/pages/api/phones/index.ts').default;
const base = { id: 'today', userId: 'owner', phoneId: sourceId, senderPhoneId: null, senderGroupId: null, status: 'QUEUED',
  messageId: null, sentAt: null, deliveredAt: null, readAt: null, leaseToken: null, lastError: 'DEVICE_OFFLINE',
  createdAt: now, nextAttemptAt: now, campaignId: null, attempts: 0, source: 'API' };
async function request(method, body, id = sourceId, userId = 'owner', fn = handler, query = {}) {
  const response = { code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; }, end() { return this; } };
  await fn({ method, body, query: { id, ...query }, user: { id: userId, role: 'USER', approvalStatus: 'APPROVED' } }, response);
  return response;
}
(async () => {
  process.env.DISPATCH_QUEUE_ENABLED = 'true';
  process.env.WHATSAPP_ENABLED = 'true';
  jobs = [{ ...base }, { ...base, id: 'yesterday', createdAt: new Date(now - day) }];
  const exclusions = [
    { status: 'PROCESSING' }, { status: 'FAILED' }, { status: 'UNCERTAIN' }, { status: 'SENT' },
    { messageId: 'existing-id' }, { sentAt: now }, { deliveredAt: now }, { readAt: now }, { leaseToken: 'claimed' },
    { userId: 'other' }, { senderPhoneId: targetId }, { createdAt: new Date(now - 8 * day) },
    { lastError: 'OUTSIDE_OPERATING_HOURS' }, { lastError: 'SENDER_GROUP_UNAVAILABLE' }, { lastError: 'SENDER_REJECTED_RETRY' },
    { sendAttempts: [{ status: 'UNCERTAIN' }] },
    { campaignId: 'campaign', campaign: { status: 'PAUSED', scheduledAt: now }, expiresAt: new Date(now.getTime() + day) },
  ].map((change, i) => ({ ...base, id: `excluded-${i}`, ...change }));
  jobs.push(...exclusions);
  const before = JSON.stringify(exclusions);
  let response = await request('GET');
  assert.equal(response.data.count, 2);
  assert.deepEqual(response.data.options.map(p => p.id), [targetId], 'Only eligible same-owner targets');
  assert.equal(response.data.options[0].remaining, 190);
  assert.equal((await request('POST', { targetPhoneId: foreignId })).code, 400);
  assert.equal((await request('GET', null, sourceId, 'other')).code, 404);
  assert.equal((await request('POST', { targetPhoneId: sourceId })).code, 400);
  assert.equal((await request('POST', { targetPhoneId: 'invalid' })).code, 400);
  usage = { attempts: 200, failures: 0 };
  assert.equal((await request('POST', { targetPhoneId: targetId })).code, 409, 'Quota checked again at save');
  usage = { attempts: 10, failures: 0 };
  response = await request('POST', { targetPhoneId: targetId });
  assert.equal(response.data.count, 2);
  for (const job of jobs.slice(0, 2)) {
    assert.equal(job.phoneId, sourceId); assert.equal(job.senderPhoneId, targetId);
    assert.equal(job.senderGroupId, null); assert.equal(job.messageId, null); assert.equal(job.attempts, 0);
  }
  assert.equal(JSON.stringify(exclusions), before, 'Processing, confirmed, uncertain, expired and ineligible jobs untouched');
  assert.equal((await request('POST', { targetPhoneId: targetId })).data.count, 0, 'Repeated save is idempotent');
  let selected = await routing.selectDispatchSender(source, jobs[0], 'lease', 120000);
  assert.equal(selected.phone.id, targetId); assert.equal(selected.grouped, false); assert.equal(selected.leased, true);
  selected = await routing.selectDispatchSender({ ...source, senderGroupId: 'later-group' }, { ...jobs[0], messageId: 'retry' }, 'lease', 120000);
  assert.equal(selected.phone.id, targetId); assert.equal(selected.grouped, false, 'Manual ACK retry stays independent of groups');
  leaseAvailable = false;
  assert.equal((await routing.selectDispatchSender(source, jobs[0], 'lease', 120000)).phone, null, 'Concurrent sender lease respected');
  leaseAvailable = true;
  socket.ws.isOpen = false;
  assert.equal(await reassignment.replacementQuota(target), null);
  assert.equal((await routing.selectDispatchSender(source, jobs[0], 'lease', 120000)).phone, null, 'Offline target never falls back to origin');
  socket.ws.isOpen = true;
  for (const change of [{ paused: true }, { warmupStartedAt: now }, { useGlobalQuota: false, dailyLimit: 5 }]) {
    policy = { useGlobalQuota: true, dailyLimit: 200, ...change };
    usage = { attempts: 25, failures: 0 };
    assert.equal(await reassignment.replacementQuota(target), null, 'Pause, warmup and custom quota applied');
  }
  policy = null; usage = { attempts: 20, failures: 8 };
  assert.equal(await reassignment.replacementQuota(target), null, 'Unhealthy number excluded');
  usage = { attempts: 10, failures: 0 };
  const today = load('src/server/messaging/safety.ts').usageDay();
  jobs = [
    { ...base, createdAt: new Date(`${today}T00:00:00+07:00`) },
    { ...base, senderPhoneId: targetId, createdAt: new Date(`${today}T23:59:59+07:00`) },
    { ...base, createdAt: new Date(new Date(`${today}T00:00:00+07:00`).getTime() - 1) },
    { ...base, createdAt: new Date(new Date(`${today}T00:00:00+07:00`).getTime() + day) },
    { ...base, status: 'SENT', createdAt: now }, { ...base, userId: 'other' },
  ];
  response = await request('GET', null, undefined, 'owner', list, { page: '1' });
  assert.equal(response.data.data.find(p => p.id === sourceId).pendingToday, 1);
  assert.equal(response.data.data.find(p => p.id === targetId).pendingToday, 1, 'Counts follow assigned sender and WIB boundaries');
  assert.deepEqual(load('src/lib/dispatchDateFilter.ts').dispatchDateFilter('2026-10-22', '2026-10-22'),
    { gte: new Date('2026-10-21T17:00:00Z'), lt: new Date('2026-10-22T17:00:00Z') });
  console.log('MANUAL_REASSIGNMENT_OK: API scope, validation, healthy quota/warmup, all-date backlog, safe exclusions, idempotence, assignment routing, leases, ACK pinning, and per-sender WIB counts.');
})().catch(error => { console.error(error); process.exitCode = 1; });
