'use strict';
// Real common worker + sender selection + safety guard + provider service,
// with in-memory persistence, synthetic time and mock HTTP. No live services.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
let now = Date.now(), row, policy, usage, window, phone, blocked, httpCalls, response, preparedError;
let hours, globalQuota, sharedDelay, warmupLimits, updates, leases, queueOrder, candidates, queueRows;
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
function match(item, where = {}) {
  if (!item) return false;
  return Object.entries(where).every(([key, value]) => {
    if (key === 'AND') return value.every(v => match(item, v));
    if (key === 'OR') return value.some(v => match(item, v));
    const actual = item[key];
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      if (key === 'campaign') return match(actual, value);
      return Object.entries(value).every(([op, v]) => ({ in: () => v.includes(actual), notIn: () => !v.includes(actual),
        not: () => actual !== v, gt: () => actual > v, lt: () => actual < v, lte: () => actual <= v, gte: () => actual >= v })[op]());
    }
    return actual === value;
  });
}
function assign(item, data) { for (const [key, value] of Object.entries(data)) item[key] = value?.increment ? item[key] + value.increment : value; return item; }
async function update({ where, data }) {
  if (!match(row, where)) return { count: 0 };
  assign(row, data); updates.push({ ...data }); return { count: 1 };
}
const db = {
  phone: { findUnique: async ({ where } = {}) => where?.token ? where.token === phone.token ? phone : null : phone, findFirst: async ({ where }) => match(phone, where) ? phone : null,
    findMany: async () => candidates, count: async () => 1, update: async ({ data }) => assign(phone, data) },
  recipientSuppression: { findUnique: async ({ where }) => blocked.has(where.userId_number.number) ? {} : null },
  deviceSendPolicy: { createMany: async () => {}, findUnique: async () => policy, findUniqueOrThrow: async () => policy,
    update: async ({ data }) => assign(policy, data), updateMany: async ({ data }) => { assign(policy, data); return { count: 1 }; } },
  deviceDailyUsage: { findUnique: async () => usage, upsert: async () => usage, update: async ({ data }) => assign(usage, data), updateMany: async ({ data }) => { assign(usage, data); return { count: 1 }; } },
  deviceQuotaWindow: { findUnique: async () => window, upsert: async ({ create, update }) => { window = window ? assign(window, update) : { ...create }; return window; } },
  waDispatch: { findFirst: async ({ where, orderBy, select }) => { if (orderBy) queueOrder = orderBy; return match(row, where) ? { ...row } : null; },
    findUnique: async () => ({ ...row }), update: async ({ data }) => assign(row, data),
    findMany: async ({ where }) => queueRows.filter(item => match(item, where)), count: async () => queueRows.length },
  user: { findUnique: async ({ where }) => where.id === 'owner' || where.token === 'owner-token'
    ? { id: 'owner', isActive: true, approvalStatus: 'APPROVED' }
    : where.token === 'other-token' ? { id: 'other', isActive: true, approvalStatus: 'APPROVED' } : null },
  waSenderLease: { updateMany: async ({ data }) => { leases.push(data); return { count: 1 }; }, createMany: async () => {}, findFirst: async () => ({}) },
  waDispatchAttempt: { create: async () => ({ id: 'attempt' }), updateMany: async () => ({ count: 1 }) },
  $queryRaw: async () => [], $transaction: async fn => fn(db),
};
const settings = {
  getGlobalDeviceQuota: async () => globalQuota,
  getDispatchDelayRange: async () => sharedDelay,
  getWarmupDailyLimits: async () => warmupLimits,
  getGlobalOperatingHours: async () => hours,
  getQuotaReset: async () => ({ mode: 'midnight', hours: 24 }),
  getDispatchAgeCutoff: async () => new Clock(0), getDispatchQueueOrder: async () => 'oldest', dispatchDeadline: () => ({}),
};
const stubs = {
  'src/lib/prisma.ts': { prisma: db },
  'src/server/dispatch/settings.ts': settings,
  'src/server/dispatchWebhook/events.ts': { updateDispatches: update, createDispatches: async (_, { data }) => {
    for (const item of data) if (!queueRows.some(old => old.dedupeKey === item.dedupeKey)) queueRows.push({ ...item, status: 'QUEUED' });
  } },
  'src/server/libs/makeWASocket.ts': { session: new Map() },
  'src/server/libs/logger.ts': { logger: () => ({ info() {}, error() {} }) },
};
const cache = {};
function load(name) {
  if (stubs[name]) return stubs[name];
  if (cache[name]) return cache[name];
  const module = { exports: {} }; cache[name] = module.exports;
  const code = ts.transpileModule(fs.readFileSync(path.join(root, name), 'utf8'), { compilerOptions: { module: 1, target: 7, esModuleInterop: true } }).outputText;
  const req = spec => {
    if (spec === '@whiskeysockets/baileys') return { generateMessageIDV2() { throw Error('WhatsApp transport must not run'); } };
    if (spec === 'node:https') return { request() { throw Error('LIVE NETWORK BLOCKED'); } };
    if (spec.startsWith('@/')) return load('src/' + spec.slice(2) + '.ts');
    if (spec.startsWith('.')) return load(path.posix.normalize(path.posix.join(path.posix.dirname(name), spec)) + '.ts');
    return require(spec);
  };
  new Function('require', 'module', 'exports', 'Date', 'setInterval', 'clearInterval', code)(req, module, module.exports, Clock, () => 1, () => {});
  cache[name] = module.exports; return module.exports;
}
const provider = load('src/server/telegram/service.ts');
stubs['src/server/telegram/service.ts'] = { ...provider, createTelegramService: config => provider.createTelegramService(config, async (url, key, body) => {
  httpCalls.push({ url: url.href, key, body });
  return { status: response.status, headers: response.headers || {}, body: JSON.stringify(response.body) };
}, () => {}) };
const telegram = load('src/server/telegram/dispatch.ts');
const worker = load('src/server/dispatch/worker.ts');
const routing = load('src/server/dispatch/senderRouting.ts');
const safety = load('src/server/messaging/safety.ts');
const connection = load('src/server/phoneConnectionInfo.ts');
let checks = 0;
const eq = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
function reset() {
  process.env.TELEGRAM_ENABLED = 'true'; process.env.WHATSAPP_ENABLED = 'false';
  process.env.TELEGRAM_API_KEY = 'offline-key'; process.env.TELEGRAM_TEST_MODE = 'false';
  process.env.TELEGRAM_SUCCESS_FIELD = 'accepted'; process.env.TELEGRAM_SUCCESS_VALUE_JSON = 'true';
  process.env.SETTINGS_ENCRYPTION_KEY = 'offline-media-signing-key'; process.env.APP_URL = 'https://app.example.invalid';
  phone = { id: 'phone', token: 'device-token', userId: 'owner', assignedUserId: null, channel: 'telegram', active: 1, showTyping: false, senderGroupId: null };
  row = { id: 'job', phoneId: 'phone', userId: 'owner', senderPhoneId: null, senderGroupId: null, source: 'API', payload: null, media: null, image: null,
    payloadHash: 'hash', status: 'QUEUED', attempts: 0, messageId: null, lastError: null, campaignId: null,
    sentAt: null, deliveredAt: null, readAt: null, nextAttemptAt: new Clock(0), createdAt: new Clock(now - 1000), recipient: '6281234567890', message: 'test' };
  policy = { phoneId: 'phone', dailyLimit: 200, useGlobalQuota: true, operatingHours: null, quotaReset: null, adaptiveEnabled: true, paused: false, warmupStartedAt: null,
    nextAllowedAt: new Clock(0), minIntervalSeconds: null, maxIntervalSeconds: null };
  usage = { attempts: 0, failures: 0 }; window = null; blocked = new Set(); httpCalls = []; updates = []; leases = [];
  response = { status: 200, body: { accepted: true } }; hours = { enabled: false, start: '08:00', end: '20:00' };
  globalQuota = 200; sharedDelay = { minSeconds: 2, maxSeconds: 2 }; warmupLimits = [20, 40, 80]; candidates = [phone]; queueRows = [];
}
async function run() { await worker.processPhone('phone'); }
(async () => {
  reset(); await run(); eq(row.status, 'SENT'); eq(httpCalls.length, 1); eq(usage.attempts, 1);
  eq(httpCalls[0].body, { phone: '+6281234567890', peer_type: 'user', message: 'test' });
  eq(policy.nextAllowedAt.getTime() - now, 2000); assert.ok(phone.lastSendProcessedAt); checks++;
  assert.ok(row.messageId.startsWith('tg_')); checks++;
  eq(row.deliveredAt, null); eq(row.readAt, null); eq(leases.at(-1).nextSendAt.getTime(), policy.nextAllowedAt.getTime());
  // A subsequent job on the same device is held by the same policy guard.
  row = { ...row, id: 'next-job', status: 'QUEUED', sentAt: null, messageId: null, attempts: 0, nextAttemptAt: new Clock(0) };
  await run(); eq(httpCalls.length, 1); eq(row.lastError, 'DEVICE_THROTTLED'); eq(row.attempts, 0);
  eq(row.nextAttemptAt.getTime(), policy.nextAllowedAt.getTime());

  for (const setup of [() => { policy.paused = true; }, () => { globalQuota = 1; usage.attempts = 1; },
    () => { policy.warmupStartedAt = new Clock(now); usage.attempts = 20; },
    () => { usage.attempts = 20; usage.failures = 6; }]) {
    reset(); setup(); await run(); eq(httpCalls.length, 0); eq(row.status, 'QUEUED'); eq(row.attempts, 0);
  }
  reset(); blocked.add(row.recipient); await run(); eq(row.status, 'SUPPRESSED'); eq(httpCalls.length, 0);
  reset(); phone.active = 0; await run(); eq(httpCalls.length, 0);
  reset(); hours = { enabled: true, start: '00:00', end: '00:01' };
  now = Date.parse('2026-10-24T05:00:00Z'); row.createdAt = new Clock(now - 1000);
  await run(); eq(httpCalls.length, 0); eq(row.lastError, 'OUTSIDE_OPERATING_HOURS');
  reset(); policy.operatingHours = { enabled: true, start: '00:00', end: '00:01' };
  await run(); eq(httpCalls.length, 0); eq(row.lastError, 'OUTSIDE_OPERATING_HOURS');
  reset(); process.env.TELEGRAM_ENABLED = 'false'; await run(); eq(httpCalls.length, 0);
  reset(); policy.minIntervalSeconds = 7; policy.maxIntervalSeconds = 7; await run(); eq(policy.nextAllowedAt.getTime() - now, 7000);
  reset(); usage.attempts = 20; usage.failures = 2; await run(); eq(policy.nextAllowedAt.getTime() - now, 6000);
  reset(); policy.useGlobalQuota = false; policy.dailyLimit = 1; usage.attempts = 1; await run(); eq(row.lastError, 'DEVICE_DAILY_LIMIT'); eq(httpCalls.length, 0);
  reset(); policy.quotaReset = { mode: 'after-full', hours: 1 }; policy.useGlobalQuota = false; policy.dailyLimit = 1;
  window = { attempts: 1, startedAt: new Clock(now - 10000), lastAttemptAt: new Clock(now), reachedAt: new Clock(now) };
  await run(); eq(row.lastError, 'DEVICE_DAILY_LIMIT'); eq(httpCalls.length, 0);
  now = load('src/lib/quotaReset.ts').fullQuotaResetAt(window.reachedAt, 1).getTime() + 1;
  row.nextAttemptAt = new Clock(0); await run(); eq(httpCalls.length, 1);

  reset(); response = { status: 420, headers: { 'retry-after': '17' }, body: { error: 'flood' } };
  await run(); eq(row.status, 'QUEUED'); eq(row.lastError, 'TELEGRAM_FLOOD_RETRY'); eq(row.nextAttemptAt.getTime() - now, 17000);
  eq(leases.at(-1).nextSendAt.getTime() - now, 17000); eq(usage.failures, 1);
  await run(); eq(httpCalls.length, 1);
  now += 17000; await run(); eq(httpCalls.length, 2); now += 17000; await run(); eq(httpCalls.length, 3); eq(row.status, 'FAILED');
  eq(row.lastError, 'TELEGRAM_FLOOD_EXHAUSTED'); await run(); eq(httpCalls.length, 3);

  for (const providerResponse of [{ status: 401, body: {} }, { status: 404, body: {} }, { status: 200, body: { success: false } }, { status: 420, body: {} }]) {
    reset(); response = providerResponse; await run(); eq(row.status, 'FAILED'); await run(); eq(httpCalls.length, 1);
  }
  reset(); response.body = { unidentified: true }; await run(); eq(row.status, 'UNCERTAIN'); await run(); eq(httpCalls.length, 1);
  reset(); row.payload = { kind: 'poll' }; await run(); eq(row.status, 'FAILED'); eq(httpCalls.length, 0);
  reset(); process.env.TELEGRAM_TEST_MODE = 'true'; process.env.TELEGRAM_TEST_PHONE = '089999999999';
  eq(telegram.telegramRecipient(row, phone).recipient, '6289999999999');
  await run(); eq(httpCalls[0].body.phone, '+6289999999999'); eq(row.recipient, '6289999999999');
  reset(); process.env.TELEGRAM_TEST_MODE = 'true'; process.env.TELEGRAM_TEST_PHONE = '089999999999'; blocked.add('6289999999999');
  await run(); eq(row.status, 'SUPPRESSED'); eq(httpCalls.length, 0);
  reset(); phone.senderGroupId = 'group'; row.senderPhoneId = 'other';
  candidates = [{ ...phone, id: 'other', channel: 'whatsapp' }];
  eq((await routing.selectDispatchSender(phone, row, 'lease', 120000)).phone, null);
  reset(); eq((await connection.getPhoneConnectionInfo(phone)).state, 'configured');
  process.env.TELEGRAM_ENABLED = 'false'; eq((await connection.getPhoneConnectionInfo(phone)).state, 'disabled');

  reset(); const signed = new URL(telegram.telegramMediaUrl(row, now));
  eq(telegram.verifyTelegramMedia(row, signed.searchParams.get('expires'), signed.searchParams.get('signature'), now), true);
  eq(telegram.verifyTelegramMedia({ ...row, id: 'another' }, signed.searchParams.get('expires'), signed.searchParams.get('signature'), now), false);
  eq(telegram.verifyTelegramMedia({ ...row, payloadHash: 'changed' }, signed.searchParams.get('expires'), signed.searchParams.get('signature'), now), false);
  eq(telegram.verifyTelegramMedia(row, signed.searchParams.get('expires'), signed.searchParams.get('signature'), now + 601000), false);
  assert.ok(!signed.href.includes(process.env.TELEGRAM_API_KEY)); checks++;
  row.image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aFZkAAAAASUVORK5CYII=';
  eq((await telegram.telegramImage(row)).mime, 'image/png');
  row.media = { userId: 'other', mime: 'image/png' };
  await assert.rejects(() => telegram.telegramImage(row), /NOT_OWNED/); checks++;
  reset();
  const auth = load('src/server/dispatchAuth.ts');
  const deviceRequest = { headers: { authorization: 'Bearer device-token' }, query: {} };
  eq((await auth.resolveDispatchDevice(deviceRequest, { channel: 'telegram' })).phone.id, 'phone');
  await assert.rejects(() => auth.resolveDispatchDevice(deviceRequest, { channel: 'whatsapp' }), error => error.status === 400); checks++;
  await assert.rejects(() => auth.resolveDispatchDevice(deviceRequest, { device_id: 'another' }), error => error.status === 403); checks++;
  eq((await auth.resolveDispatchDevice({ ...deviceRequest, headers: { authorization: 'Bearer owner-token' } }, { device_id: 'phone', channel: 'telegram' })).phone.id, 'phone');
  await assert.rejects(() => auth.resolveDispatchDevice({ ...deviceRequest, headers: { authorization: 'Bearer other-token' } }, { device_id: 'phone' }), error => error.status === 403); checks++;

  // Real enqueue logic: persist redirected recipients while retaining stable
  // transaction/job identities and conflict protection before any network call.
  process.env.TELEGRAM_TEST_MODE = 'true'; process.env.TELEGRAM_TEST_PHONE = '089999999999';
  const queue = load('src/server/dispatch/queue.ts');
  const body = { number: '081234567890', message: 'test', transaction_id: 'transaction-test', job_id: 'client-job' };
  const admitted = await queue.enqueueDispatch('phone', 'owner', body);
  eq(admitted.queued, true); eq(queueRows.length, 1); eq(queueRows[0].recipient, '6289999999999'); eq(httpCalls.length, 0);
  const duplicate = await queue.enqueueDispatch('phone', 'owner', body);
  eq(duplicate.existing, true); eq(queueRows.length, 1);
  process.env.TELEGRAM_TEST_MODE = 'false';
  const afterModeChange = await queue.enqueueDispatch('phone', 'owner', body);
  eq(afterModeChange.data[0].recipient, '6289999999999');
  await assert.rejects(() => queue.enqueueDispatch('phone', 'other', { ...body, job_id: undefined }), error => error.status === 404); checks++;
  console.log(`TELEGRAM_SHARED_DISPATCH_PASSED (${checks} checks; real shared worker/safety, mock HTTP, no real messages)`);
})().catch(error => { console.error(error); process.exitCode = 1; });
