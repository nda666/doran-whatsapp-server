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
  let usages = {};
  const db = {
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
        const oldStamp = stamp, oldUsages = structuredClone(usages), oldPolicy = { ...policy };
        try { return await fn(db); } catch (error) { stamp = oldStamp; usages = oldUsages; policy = oldPolicy; throw error; }
      });
      chain = result.catch(() => {}); return result;
    },
  };
  const safety = load('src/server/messaging/safety.ts', {
    '../../lib/warmupSettings': { DEFAULT_WARMUP_DAILY_LIMITS: [25] },
    '../../lib/operatingHours': load('src/lib/operatingHours.ts', { zod: require('zod') }),
    '../../lib/dispatchPresentation': { dispatchErrorLabels: {} }, '../dispatchWebhook/events': {},
    '../../lib/prisma': { prisma: db }, '../../utils/normalizePhoneRecipient': { normalizePhoneRecipient: number => number },
    '../../lib/deviceQuota': { deviceDailyQuota: p => p.dailyLimit },
    '../dispatch/settings': { getGlobalOperatingHours: async () => ({ enabled: false, start: '08:00', end: '20:00' }), getGlobalDeviceQuota: async () => 200, getDispatchDelayRange: async () => ({ minSeconds: 0, maxSeconds: 0 }), getWarmupDailyLimits: async () => [25] },
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
  console.log('PHONE_LAST_SEND_OK: atomic quota/timestamp, retries, rejected sends, concurrency, DB rollback, WIB midnight and retained history');
})().catch(error => { console.error(error); process.exitCode = 1; });
