'use strict';
// Synthetic admission tests: no database or WhatsApp traffic.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
let now = Date.parse('2026-10-20T16:59:59Z');
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
function load(file, mocks) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: 1, target: 7, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, require: key => { assert(key in mocks, key); return mocks[key]; }, Date: Clock });
  return exports;
}
(async () => {
  let stamp = null, blocked = false, fail = false, chain = Promise.resolve();
  let policy = { dailyLimit: 3, useGlobalQuota: false, minIntervalSeconds: null, maxIntervalSeconds: null, adaptiveEnabled: true, paused: false, warmupStartedAt: null, nextAllowedAt: new Date(0) };
  let usages = {}, window = null;
  let reset = { mode: "midnight", hours: 2 };
  const db = {
    deviceQuotaWindow: { findUnique: async () => window, upsert: async ({ create, update }) => { window = window ? { ...window, ...update } : create; } },
    recipientSuppression: { findUnique: async () => blocked ? {} : null },
    deviceSendPolicy: { createMany: async () => {}, findUniqueOrThrow: async () => policy, update: async ({ data }) => { if (fail) throw new Error('DB_WRITE_FAILED'); Object.assign(policy, data); } },
    deviceDailyUsage: {
      upsert: async ({ create }) => usages[create.day] ||= { attempts: 0, failures: 0 },
      update: async ({ where }) => { usages[where.phoneId_day.day].attempts++; },
    },
    phone: { update: async ({ where, data }) => { assert.equal(where.id, 'phone'); stamp = data.lastSendProcessedAt; } },
    $queryRaw: async () => [],
    $transaction: fn => {
      const result = chain.then(async () => {
        const oldWindow = window && { ...window };
        const oldStamp = stamp, oldUsages = structuredClone(usages), oldPolicy = { ...policy };
        try { return await fn(db); } catch (error) { window = oldWindow; stamp = oldStamp; usages = oldUsages; policy = oldPolicy; throw error; }
      });
      chain = result.catch(() => {}); return result;
    },
  };
  const safety = load('src/server/messaging/safety.ts', {
    '../../lib/quotaReset': load('src/lib/quotaReset.ts', { zod: require('zod') }),
    '../../lib/warmupSettings': { DEFAULT_WARMUP_DAILY_LIMITS: [25] },
    '../../lib/operatingHours': load('src/lib/operatingHours.ts', { zod: require('zod') }),
    '../../lib/dispatchPresentation': { dispatchErrorLabels: {} }, '../dispatchWebhook/events': {},
    '../../lib/prisma': { prisma: db }, '../../utils/normalizePhoneRecipient': { normalizePhoneRecipient: number => number },
    '../../lib/deviceQuota': { deviceDailyQuota: p => p.dailyLimit },
    '../dispatch/settings': { getQuotaReset: async () => reset, getGlobalOperatingHours: async () => ({ enabled: false, start: '08:00', end: '20:00' }), getGlobalDeviceQuota: async () => 200, getDispatchDelayRange: async () => ({ minSeconds: 0, maxSeconds: 0 }), getWarmupDailyLimits: async () => [25] },
    '../dispatch/timing': { randomDispatchDelay: () => 0 }, '../../lib/deviceSendInterval': {},
  });
  const send = () => safety.reserveSend('owner', 'phone', '628123@s.whatsapp.net');
  assert.equal(stamp, null);
  blocked = true; await assert.rejects(send(), e => e.code === 'RECIPIENT_OPTED_OUT'); assert.equal(stamp, null); blocked = false;
  const day = await send(); assert.equal(day, '2026-10-20'); assert.equal(stamp.toISOString(), new Date(now).toISOString()); assert.equal(usages[day].attempts, 1);
  const first = stamp; now += 100;
  policy.nextAllowedAt = new Date(now + 10000); await assert.rejects(send(), e => e.code === 'DEVICE_THROTTLED'); assert.equal(stamp, first); assert.equal(usages[day].attempts, 1);
  policy.nextAllowedAt = new Date(0); policy.paused = true; await assert.rejects(send(), e => e.code === 'DEVICE_SAFETY_PAUSED'); assert.equal(stamp, first); policy.paused = false;
  fail = true; await assert.rejects(send(), /DB_WRITE_FAILED/); assert.equal(stamp, first); assert.equal(usages[day].attempts, 1, 'Timestamp and quota roll back together'); fail = false;
  await send(); assert.equal(usages[day].attempts, 2); assert.equal(stamp.getTime(), now, 'A retry consuming quota advances timestamp');
  now += 100;
  const concurrent = await Promise.allSettled([send(), send(), send()]); assert.equal(concurrent.filter(r => r.status === 'fulfilled').length, 1); assert.equal(usages[day].attempts, 3);
  const last = stamp; now += 100; await assert.rejects(send(), e => e.code === 'DEVICE_DAILY_LIMIT'); assert.equal(stamp, last);
  now = Date.parse('2026-10-20T17:00:00Z'); assert.equal(stamp, last, 'Midnight alone does not reset last processing time');
  assert.equal(await send(), '2026-10-21'); assert.equal(stamp.getTime(), now); assert.equal(usages['2026-10-21'].attempts, 1);
  // A full quota at 23:00 WIB must stay blocked across midnight until 01:00.
  reset = { mode: 'after-full', hours: 2 }; window = null; usages = {};
  now = Date.parse('2026-10-21T16:00:00Z'); policy.nextAllowedAt = new Date(0);
  await send(); await send(); await send();
  const fullAt = window.reachedAt.getTime();
  now = Date.parse('2026-10-21T17:00:00Z');
  await assert.rejects(send(), e => e.code === 'DEVICE_DAILY_LIMIT' && e.retryAt.getTime() === fullAt + 7200000);
  now = fullAt + 7200000 - 1; await assert.rejects(send(), e => e.code === 'DEVICE_DAILY_LIMIT');
  now++; await send(); assert.equal(window.attempts, 1); assert.equal(window.reachedAt, null);
  // Partially used quota continues across a day boundary without starting a timer.
  now += 86400000; await send(); assert.equal(window.attempts, 2); assert.equal(window.reachedAt, null);
  now += 22 * 3600000; // Fill the quota at 23:00 WIB, selecting the delay branch.
  await send(); assert.equal(window.attempts, 3); assert.equal(window.reachedAt.getTime(), now);
  // A device override takes precedence over the global midnight setting.
  policy.quotaReset = { mode: 'after-full', hours: 2 }; reset = { mode: 'midnight', hours: 24 };
  now += 3600000;
  await assert.rejects(send(), e => e.code === 'DEVICE_DAILY_LIMIT');
  delete policy.quotaReset; reset = { mode: 'after-full', hours: 2 }; now -= 3600000;
  // Reset hours can be changed without moving the moment the quota became full.
  reset.hours = 1; now += 3600000; await send(); assert.equal(window.attempts, 1);
  // Restart/reload uses the persisted window and does not change its deadline.
  const quotaHelpers = load('src/lib/quotaReset.ts', { zod: require('zod') });
  for (const value of ['{}', '{"mode":"after-full","hours":0}', '{"mode":"after-full","hours":1.5}', '{"mode":"bad","hours":2}', '{"mode":"after-full","hours":169}', 'bad']) assert.equal(quotaHelpers.parseQuotaReset(value), null);
  assert.deepEqual(JSON.parse(JSON.stringify(quotaHelpers.parseQuotaReset('{"mode":"after-full","hours":6}'))), { mode: 'after-full', hours: 6 });
  reset = { mode: 'after-full', hours: 7 }; window = null; usages = {};
  now = Date.parse('2026-10-25T03:00:00Z'); policy.nextAllowedAt = new Date(0);
  await send(); await send(); await send();
  // Full at 10:00 WIB waits for midnight, even after the seven-hour delay passes.
  now += 7 * 3600000;
  await assert.rejects(send(), e => e.code === 'DEVICE_DAILY_LIMIT' && e.retryAt.toISOString() === '2026-10-25T17:00:00.000Z');
  now = Date.parse('2026-10-25T17:00:00Z'); await send(); assert.equal(window.attempts, 1);
  console.log('PHONE_LAST_SEND_OK: atomic quota/timestamp, retries, rejected sends, concurrency, DB rollback, WIB midnight retained history, after-full deadlines, midnight continuity, partial cycles and setting validation');
})().catch(error => { console.error(error); process.exitCode = 1; });
