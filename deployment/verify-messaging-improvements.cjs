'use strict';
// Synthetic behavioral tests. No production database, WhatsApp or email calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function loader(stubs) {
  const cache = new Map();
  function load(name) {
    if (stubs[name]) return stubs[name];
    if (cache.has(name)) return cache.get(name);
    const file = path.join(root, name), real = createRequire(file), module = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: 1, target: 7, esModuleInterop: true } }).outputText;
    const req = spec => {
      if (stubs[spec]) return stubs[spec];
      if (!spec.startsWith('.') && !spec.startsWith('@/')) return real(spec);
      const resolved = spec.startsWith('@/') ? 'src/' + spec.slice(2) : path.posix.normalize(path.posix.join(path.posix.dirname(name), spec));
      return load(resolved + '.ts');
    };
    new Function('require', 'module', 'exports', code)(req, module, module.exports);
    cache.set(name, module.exports); return module.exports;
  }
  return load;
}
async function safetyTests() {
  const blocked = new Map(); let enabled = false, updates = 0;
  const policy = { dailyLimit: 3, useGlobalQuota: false, minIntervalSeconds: 0, adaptiveEnabled: true, paused: false, warmupStartedAt: null, nextAllowedAt: new Date(0) };
  const usage = { attempts: 0, failures: 0 }; let chain = Promise.resolve();
  const db = {
    messagingPreference: { findUnique: async () => ({ optOutEnabled: enabled }) },
    recipientSuppression: { findUnique: async ({ where }) => blocked.get(JSON.stringify(where.userId_number)), upsert: async ({ create }) => blocked.set(JSON.stringify({ userId: create.userId, number: create.number }), create) },
    deviceSendPolicy: { createMany: async () => {}, upsert: async () => policy, findUniqueOrThrow: async () => policy, update: async ({ data }) => Object.assign(policy, data) },
    deviceQuotaWindow: { findUnique: async () => null, upsert: async () => ({}) },
    deviceDailyUsage: { upsert: async () => usage, update: async () => { usage.attempts++; } },
    phone: { update: async () => {} },
    $queryRaw: async () => [],
    $transaction: fn => { const next = chain.then(() => fn(db)); chain = next.catch(() => {}); return next; },
  };
  let globalSeconds = 0, globalQuota = 200;
  const load = loader({ 'src/lib/prisma.ts': { prisma: db }, 'src/server/dispatch/settings.ts': { getQuotaReset: async () => ({ mode: 'midnight', hours: 24 }), getWarmupDailyLimits: async () => [25, 50, 100, 200, 400, 800], getGlobalOperatingHours: async () => ({ enabled: false, start: '08:00', end: '20:00' }), getGlobalDeviceQuota: async () => globalQuota, getDispatchDelayRange: async () => ({ minSeconds: globalSeconds, maxSeconds: globalSeconds }) }, 'src/server/dispatchWebhook/events.ts': { updateDispatches: async () => { updates++; } } });
  const safety = load('src/server/messaging/safety.ts');
  assert.equal(await safety.captureStop('a', '6281234567890@s.whatsapp.net', 'STOP'), false);
  enabled = true;
  assert.equal(await safety.captureStop('a', '6281234567890@g.us', 'STOP'), false);
  assert.equal(await safety.captureStop('a', '6281234567890@s.whatsapp.net', 'jangan stop pesanan'), false);
  assert.equal(await safety.captureStop('a', '6281234567890@s.whatsapp.net', ' stop! '), true);
  assert.equal(updates, 1);
  assert.equal(await safety.recipientBlocked('a', '6281234567890'), true);
  assert.equal(await safety.recipientBlocked('b', '6281234567890'), false);
  enabled = false;
  await assert.rejects(safety.reserveSend('a', 'p', '6281234567890@s.whatsapp.net'), e => e.code === 'RECIPIENT_OPTED_OUT');
  const results = await Promise.allSettled(Array.from({ length: 10 }, () => safety.reserveSend('b', 'p', '6281234567890@s.whatsapp.net')));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 3);
  assert.equal(usage.attempts, 3);
  usage.attempts = 0; policy.minIntervalSeconds = 5;
  await safety.reserveSend('b', 'p', '6281234567890@s.whatsapp.net');
  await assert.rejects(safety.reserveSend('b', 'p', '6281234567890@s.whatsapp.net'), e => e.code === 'DEVICE_THROTTLED');
  policy.nextAllowedAt = new Date(0); policy.minIntervalSeconds = null; globalSeconds = 7;
  usage.attempts = 0;
  const beforeGlobal = Date.now(); await safety.reserveSend('b', 'p', '6281234567890@s.whatsapp.net');
  assert.ok(policy.nextAllowedAt.getTime() >= beforeGlobal + 7000);
  assert.ok(policy.nextAllowedAt.getTime() <= Date.now() + 7000);
  assert.equal(safety.effectiveSendInterval(4000, null, 1), 4000);
  assert.equal(safety.effectiveSendInterval(4000, 10, 1), 10000);
  assert.equal(safety.effectiveSendInterval(4000, 1, 1), 4000);
  assert.equal(safety.effectiveSendInterval(4000, null, 3), 12000);
  usage.attempts = 199; policy.nextAllowedAt = new Date(0); policy.useGlobalQuota = true; globalSeconds = 0;
  await safety.reserveSend('b', 'p', '6281234567890@s.whatsapp.net');
  await assert.rejects(safety.reserveSend('b', 'p', '6281234567890@s.whatsapp.net'), e => e.code === 'DEVICE_DAILY_LIMIT');
  policy.useGlobalQuota = false; policy.dailyLimit = 201; policy.nextAllowedAt = new Date(0);
  await safety.reserveSend('b', 'p', '6281234567890@s.whatsapp.net');
  await assert.rejects(safety.reserveSend('b', 'p', '6281234567890@s.whatsapp.net'), e => e.code === 'DEVICE_DAILY_LIMIT');
  const quota = load('src/lib/deviceQuota.ts');
  for (const value of ['', '0', '-1', '1.5', '100001', 'abc']) assert.equal(quota.parseDeviceDailyQuota(value), null);
  assert.equal(quota.parseDeviceDailyQuota('200'), 200);
  usage.attempts = 45; policy.useGlobalQuota = true; globalQuota = 45;
  await assert.rejects(safety.reserveSend('b', 'p', '6281234567890@s.whatsapp.net'), e => e.code === 'DEVICE_DAILY_LIMIT');
  globalQuota = 50;
  const increased = await Promise.allSettled(Array.from({ length: 10 }, () => safety.reserveSend('b', 'p', '6281234567890@s.whatsapp.net')));
  assert.equal(increased.filter(result => result.status === 'fulfilled').length, 5);
  assert.equal(usage.attempts, 50, '45 -> 50 permits exactly five additional attempts, including concurrent admission');
  globalQuota = 200;
  policy.nextAllowedAt = new Date(0); policy.paused = true;
  await assert.rejects(safety.reserveSend('b', 'p', '6281234567890@s.whatsapp.net'), e => e.code === 'DEVICE_SAFETY_PAUSED');
  assert.equal(safety.usageDay(new Date('2026-10-17T16:59:59Z')), '2026-10-17');
  assert.equal(safety.usageDay(new Date('2026-10-17T17:00:00Z')), '2026-10-18');
  assert.equal(safety.warmupLimit(new Date(0), 1000, 0), 25);
  assert.equal(safety.warmupLimit(new Date(0), 10, 0), 10);
  assert.equal(safety.warmupLimit(new Date(0), 1000, 12 * 86400000), 1000);
  assert.equal(safety.healthAssessment(19, 19).score, null);
  assert.equal(safety.healthAssessment(20, 2).multiplier, 3);
  assert.equal(safety.healthAssessment(20, 6).stop, true);
  console.log('PASS opt-out, owner isolation, quota admission, throttling, pause, WIB reset, warm-up, health');
}
async function alertTests() {
  let state = { phoneId: 'p', nextAttemptAt: new Date(0) }, online = false, enabled = true, delivered = 0;
  const db = {
    deviceAlertState: {
      upsert: async () => state,
      updateMany: async ({ where, data }) => {
        if (where.leaseToken && where.leaseToken !== state.leaseToken) return { count: 0 };
        if (where.nextAttemptAt && state.nextAttemptAt > new Date()) return { count: 0 };
        if (where.OR && state.leaseUntil > new Date()) return { count: 0 };
        Object.assign(state, data); return { count: 1 };
      },
      update: async ({ data }) => Object.assign(state, data), findUniqueOrThrow: async () => ({ ...state }),
    },
    phone: { findUnique: async () => ({ id: 'p', name: 'Synthetic device', number: '62000000000', userId: 'a', isOnline: online }) },
    messagingPreference: { findUnique: async () => ({ offlineAlertsEnabled: enabled, alertEmail: 'test@example.invalid', offlineDelaySeconds: 90 }) },
    globalSetting: { findUnique: async () => null },
  };
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://api.postmarkapp.com/email');
    assert.equal(JSON.parse(options.body).MessageStream, 'outbound');
    delivered++; return { ok: true, json: async () => ({ ErrorCode: 0 }) };
  };
  try {
    const load = loader({ 'src/lib/prisma.ts': { prisma: db }, 'src/server/passwordReset.ts': { postmarkServerToken: async () => 'synthetic' }, 'src/lib/globalSettings.ts': { decryptSetting: v => v } });
    const { processDeviceAlert } = load('src/server/messaging/alerts.ts');
    await processDeviceAlert('p'); assert.equal(delivered, 0);
    state.offlineAt = new Date(Date.now() - 91000);
    await Promise.all([processDeviceAlert('p'), processDeviceAlert('p')]); assert.equal(delivered, 1);
    await processDeviceAlert('p'); assert.equal(delivered, 1);
    online = true; await processDeviceAlert('p'); assert.equal(delivered, 1);
    state.nextAttemptAt = new Date(0); online = false; await processDeviceAlert('p'); assert.equal(delivered, 1); assert.equal(state.recoveryPending, false);
    online = true; await processDeviceAlert('p'); assert.equal(delivered, 1);
    state.nextAttemptAt = new Date(0); await processDeviceAlert('p'); assert.equal(delivered, 2);
    await processDeviceAlert('p'); assert.equal(delivered, 2);
    online = false; await processDeviceAlert('p'); state.offlineAt = new Date(Date.now() - 91000);
    await processDeviceAlert('p'); assert.equal(delivered, 2);
    enabled = false; state.lastAlertAt = null; await processDeviceAlert('p'); assert.equal(delivered, 2);
    assert.equal(state.offlineAt, null);
    console.log('PASS Postmark alerts, debounce, concurrent claim, recovery stabilization, cooldown, OFF');
  } finally { global.fetch = originalFetch; }
}
async function exportTests() {
  const id = '14b26971-263a-4acd-9a75-0efec6e2c653';
  const summary = { total: 1, attempted: 1, sent: 1, delivered: 1, read: 0, failed: 0, suppressed: 0, pending: 0, uncertain: 0, deliveryRate: 100, readRate: 0, failureRate: 0, failures: [], devices: [{ phoneId: 'p', counts: { DELIVERED: 1 } }] };
  const load = loader({
    'src/lib/prisma.ts': { prisma: { campaign: { findFirst: async ({ where }) => where.userId === 'a' ? { id, userId: 'a', name: '=Synthetic report' } : null }, phone: { findMany: async () => [{ id: 'p', name: 'Synthetic device' }] }, waDispatch: { findMany: async () => [{ recipient: '6281234567890', phoneId: 'p', status: 'DELIVERED', attempts: 1, createdAt: new Date() }] } } },
    'src/server/messaging/analytics.ts': { summarize: async () => summary },
    'src/lib/access.ts': { ownerScope: user => ({ userId: user.id }) },
    'src/middleware/apiAuthMiddleware.ts': { __esModule: true, default: fn => fn },
  });
  const handler = load('src/pages/api/campaign-report.ts').default;
  const response = () => ({ headers: {}, code: 200, setHeader(k,v) { this.headers[k] = v; }, status(v) { this.code = v; return this; }, json(v) { this.body = v; }, send(v) { this.body = v; } });
  let res = response(); await handler({ method: 'GET', user: { id: 'b' }, query: { campaignId: id } }, res); assert.equal(res.code, 404);
  res = response(); await handler({ method: 'GET', user: { id: 'a' }, query: { campaignId: id, export: 'xlsx' } }, res);
  assert.equal(res.body.subarray(0,2).toString(), 'PK');
  const ExcelJS = require('exceljs'), workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(res.body);
  assert.equal(workbook.getWorksheet('Penerima').getCell('A2').value, '6281234567890');
  assert.equal(workbook.getWorksheet('Ringkasan').getCell('B1').type, ExcelJS.ValueType.String);
  res = response(); await handler({ method: 'GET', user: { id: 'a' }, query: { campaignId: id, export: 'pdf' } }, res);
  assert.equal(res.body.subarray(0,5).toString(), '%PDF-');
  fs.mkdirSync(path.join(root, 'tmp/messaging-verification'), { recursive: true });
  fs.writeFileSync(path.join(root, 'tmp/messaging-verification/campaign-report.pdf'), res.body);
  summary.total = 10001; res = response(); await handler({ method: 'GET', user: { id: 'a' }, query: { campaignId: id, export: 'xlsx' } }, res); assert.equal(res.code, 400);
  console.log('PASS campaign report ownership, real XLSX parsing, phone text, formula safety, PDF generation, export limit');
}
async function scheduleTests() {
  const id = '14b26971-263a-4acd-9a75-0efec6e2c653', updatedAt = new Date('2026-01-01T00:00:00Z');
  let owner = 'a', status = 'WAITING', attempts = 0, writes = 0;
  const tx = {
    $queryRaw: async () => [], $executeRaw: async () => { writes++; },
    campaign: { findFirst: async ({ where }) => where.userId === owner ? { id, userId: owner, status, updatedAt, scheduledAt: new Date() } : null, update: async () => { writes++; } },
    waDispatch: { count: async () => attempts },
  };
  const load = loader({
    'src/lib/prisma.ts': { prisma: { $transaction: fn => fn(tx) } },
    'src/lib/access.ts': { ownerScope: user => ({ userId: user.id }) },
    'src/middleware/apiAuthMiddleware.ts': { __esModule: true, default: fn => fn },
  });
  const handler = load('src/pages/api/campaign-schedules.ts').default;
  const response = () => ({ code: 200, setHeader() {}, status(v) { this.code = v; return this; }, json(v) { this.body = v; }, end() {} });
  const request = () => ({ method: 'PATCH', user: { id: 'a' }, body: { id, updatedAt: updatedAt.toISOString(), scheduledAt: new Date(Date.now() + 86400000).toISOString() } });
  let res = response(); await handler(request(), res); assert.equal(res.code, 200); assert.equal(writes, 2);
  status = 'PROCESSING'; res = response(); await handler(request(), res); assert.equal(res.code, 409); assert.equal(writes, 2);
  status = 'WAITING'; attempts = 1; res = response(); await handler(request(), res); assert.equal(res.code, 409); assert.equal(writes, 2);
  attempts = 0; owner = 'b'; res = response(); await handler(request(), res); assert.equal(res.code, 409); assert.equal(writes, 2);
  owner = 'a'; const stale = request(); stale.body.updatedAt = '2025-01-01T00:00:00Z'; res = response(); await handler(stale, res); assert.equal(res.code, 409); assert.equal(writes, 2);
  console.log('PASS schedule changes, owner isolation, started campaign rejection, optimistic concurrency');
}
async function admissionTests() {
  let written;
  const tx = { $queryRaw: async () => [], dispatchWebhookSetting: { findUnique: async () => null }, recipientSuppression: { findMany: async () => [{ userId: 'a', number: '6281234567890' }] }, waDispatch: { createMany: async ({ data }) => { written = data; return { count: data.length }; } } };
  const load = loader({ 'src/lib/prisma.ts': { prisma: {} } });
  const { createDispatches } = load('src/server/dispatchWebhook/events.ts');
  await createDispatches(tx, { data: [{ id: '1', userId: 'a', recipient: '6281234567890' }, { id: '2', userId: 'b', recipient: '6281234567890' }] });
  assert.equal(written[0].status, 'SUPPRESSED'); assert.equal(written[1].status, undefined);
  console.log('PASS suppression at queue admission across all dispatch sources and account isolation');
}
async function futureScheduleTests() {
  const now = Date.now(), day = 86400000;
  const jobs = [
    { id: 'future', status: 'QUEUED', createdAt: new Date(now - 3 * day), campaignId: 'c1', campaign: { status: 'WAITING', scheduledAt: new Date(now + 2 * day) }, expiresAt: new Date(now + 3 * day) },
    { id: 'old-campaign', status: 'QUEUED', createdAt: new Date(now - 3 * day), campaignId: 'c2', campaign: { status: 'WAITING', scheduledAt: new Date(now - 3 * day) }, expiresAt: new Date(now + day) },
    { id: 'old-api', status: 'QUEUED', createdAt: new Date(now - 3 * day), campaignId: null, campaign: null, expiresAt: new Date(now + day) },
  ];
  function matches(object, where) {
    return Object.entries(where).every(([key, value]) => {
      if (key === 'OR') return value.some(branch => matches(object, branch));
      if (key === 'AND') return value.every(branch => matches(object, branch));
      if (key === 'gt') return object > value;
      if (key === 'lt') return object < value;
      if (key === 'lte') return object <= value;
      if (key === 'in') return value.includes(object);
      if (key === 'not') return object !== value;
      if (value && typeof value === 'object' && !(value instanceof Date)) return object?.[key] != null && matches(object[key], value);
      return object?.[key] === value;
    });
  }
  const stubs = {
    '@whiskeysockets/baileys': {},
    'src/server/messaging/safety.ts': {},
    'src/lib/prisma.ts': { prisma: { campaign: { updateMany: async () => ({ count: 0 }) } } },
    'src/server/dispatchWebhook/events.ts': { updateDispatches: async ({ where, data }) => { const found = jobs.filter(j => matches(j, where)); found.forEach(j => Object.assign(j, data)); return { count: found.length }; } },
    'src/server/libs/makeWASocket.ts': { session: new Map() },
    'src/server/libs/phoneMaintenance.ts': { phoneMaintenance: new Set() },
    'src/server/dispatch/media.ts': {}, 'src/server/campaigns/media.ts': {}, 'src/server/campaigns/content.ts': {},
    'src/server/dispatch/settings.ts': { getDispatchAgeCutoff: async () => new Date(now - day) },
    'src/server/dispatch/receipts.ts': {}, 'src/server/dispatch/acknowledgement.ts': {},
  };
  let quotaRecoveries = 0;
  stubs['src/server/dispatch/quotaRecovery.ts'] = { recoverQuotaDispatches: async () => { quotaRecoveries++; } };
  await loader(stubs)('src/server/dispatch/worker.ts').recoverDispatches();
  assert.equal(quotaRecoveries, 1, 'Periodic/startup recovery must revisit daily-limit sleeps');
  assert.equal(jobs[0].status, 'QUEUED'); assert.equal(jobs[1].status, 'FAILED'); assert.equal(jobs[2].status, 'FAILED');
  console.log('PASS future campaigns survive queue recovery while expired API/campaign ages remain enforced');
}
async function sharedCooldownTests() {
  let finalLease, cooldown = new Date(Date.now() + 20000);
  const job = { id: 'synthetic-job', userId: 'a', phoneId: 'p', recipient: '6280000000000', campaignId: null, payload: null, media: null, image: null, message: 'fixture', attempts: 0, messageId: null };
  const db = {
    phone: { findUnique: async () => ({ id: 'p', userId: 'a', active: 1 }) },
    waDispatchAttempt: { create: async () => ({ id: 'attempt' }), updateMany: async () => ({ count: 1 }) },
    waSenderLease: { updateMany: async ({ data }) => { if (data.nextSendAt) finalLease = data; return { count: 1 }; }, findFirst: async () => ({}) },
    waDispatch: { findFirst: async () => job, findUnique: async () => ({ status: 'PROCESSING' }) },
    deviceSendPolicy: { findUnique: async () => ({ nextAllowedAt: cooldown }) },
    $transaction: fn => fn(db),
  };
  const stubs = {
    '@whiskeysockets/baileys': { generateMessageIDV2: () => 'synthetic-message' },
    'src/lib/prisma.ts': { prisma: db },
    'src/server/messaging/safety.ts': { recipientBlocked: async () => false, SendGuardError: class extends Error {} },
    'src/server/dispatchWebhook/events.ts': { updateDispatches: async () => ({ count: 1 }) },
    'src/server/libs/makeWASocket.ts': { session: new Map([['p', { ws: { isOpen: true }, user: { id: 'synthetic-user' }, sendMessage: async () => ({ key: { id: 'synthetic-message' } }), waitForMessage() {} }]]) },
    'src/server/libs/phoneMaintenance.ts': { phoneMaintenance: new Set() },
    'src/server/dispatch/media.ts': {}, 'src/server/campaigns/media.ts': {}, 'src/server/campaigns/content.ts': {},
    'src/server/dispatch/settings.ts': { getDispatchAgeCutoff: async () => new Date(0), getDispatchQueueOrder: async () => 'oldest', getGlobalOperatingHours: async () => ({ enabled: false, start: '08:00', end: '20:00' }), getGlobalDeviceQuota: async () => 200, getDispatchDelayRange: async () => ({ minSeconds: 30, maxSeconds: 30 }), dispatchDeadline: () => ({}) },
    'src/server/dispatch/receipts.ts': { recordDispatchReceipt: async () => {} },
    'src/server/dispatch/acknowledgement.ts': { waitForDispatchAcknowledgement: async () => ({ attrs: {} }) },
  };
  const worker = loader(stubs)('src/server/dispatch/worker.ts');
  await worker.processPhone('p');
  assert.equal(finalLease.nextSendAt.getTime(), cooldown.getTime(), 'Reuse the transport cooldown instead of a second random global delay');
  cooldown = new Date(0);
  await worker.processPhone('p');
  assert.ok(finalLease.nextSendAt.getTime() <= Date.now() + 1000, 'Do not add the global interval again after the ACK');
  console.log('PASS transport cooldown reused by worker; no second global delay after ACK');
}
(async () => { await safetyTests(); await alertTests(); await exportTests(); await scheduleTests(); await admissionTests(); await futureScheduleTests(); await sharedCooldownTests(); })().catch(error => { console.error(error); process.exitCode = 1; });
