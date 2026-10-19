'use strict';
// In-memory regression: no database, WhatsApp, or network access.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(file, mocks = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  new Function('require', 'module', 'exports', code)(key => key in mocks ? mocks[key]
    : key.startsWith('.') ? load(path.resolve(path.dirname(file), key + '.ts'), mocks) : require(key), mod, mod.exports);
  return mod.exports;
}
function matches(row, where) {
  return Object.entries(where).every(([key, value]) => key === 'OR'
    ? value.some(branch => matches(row, branch))
    : value && typeof value === 'object' && !(value instanceof Date)
      ? Object.entries(value).every(([op, date]) => op === 'gt' ? row[key] > date : row[key] < date)
      : row[key] === value);
}
async function scenario(options = {}) {
  const now = new Date('2026-10-19T05:00:00Z'), midnight = new Date('2026-10-19T17:00:00Z');
  const policy = { phoneId: 'p', dailyLimit: 45, useGlobalQuota: true, paused: false,
    adaptiveEnabled: true, warmupStartedAt: null, nextAllowedAt: new Date(now.getTime() + 10000), ...options.policy };
  const usage = { attempts: 45, failures: 0, ...options.usage };
  const job = { phoneId: 'p', status: 'QUEUED', lastError: 'DEVICE_DAILY_LIMIT',
    nextAttemptAt: midnight, messageId: null, sentAt: null, deliveredAt: null, readAt: null, ...options.job };
  const others = [
    { ...job, lastError: 'DEVICE_OFFLINE' }, { ...job, status: 'UNCERTAIN' },
    { ...job, status: 'SENT', sentAt: now }, { ...job, deliveredAt: now }, { ...job, readAt: now },
  ];
  const jobs = [job, ...others];
  const lease = { phoneId: 'p', nextSendAt: midnight, leaseUntil: options.active ? midnight : null };
  const update = (rows, { where, data }) => {
    const found = rows.filter(row => matches(row, where));
    found.forEach(row => Object.assign(row, data)); return { count: found.length };
  };
  let reads = 0;
  const db = {
    waDispatch: { findMany: async ({ where }) => jobs.filter(row => matches(row, where)).map(row => ({ phoneId: row.phoneId })),
      updateMany: async args => update(jobs, args) },
    deviceSendPolicy: { findUnique: async () => policy },
    deviceDailyUsage: { findUnique: async ({ where }) => { assert.equal(where.phoneId_day.day, '2026-10-19'); return usage; } },
    waSenderLease: { updateMany: async args => update([lease], args) },
    $transaction: async fn => fn(db),
  };
  const recovery = load('src/server/dispatch/quotaRecovery.ts', {
    '../../lib/prisma': { prisma: db },
    '../messaging/safety': load('src/server/messaging/safety.ts', {
      '../../lib/prisma': {}, '../dispatchWebhook/events': {}, '../dispatch/settings': {},
    }),
    './settings': { getGlobalDeviceQuota: async () => { reads++; return options.globalQuota ?? 50; },
      getWarmupDailyLimits: async () => options.warmupLimits || [25, 50, 100] },
  });
  await recovery.recoverQuotaDispatches(now);
  for (const other of others) assert.equal(other.nextAttemptAt, midnight, 'Unrelated/confirmed jobs must remain untouched');
  if (options.blocked) {
    assert.equal(job.nextAttemptAt, midnight); assert.equal(lease.nextSendAt, midnight);
  } else {
    assert.equal(job.nextAttemptAt, now);
    assert.equal(lease.nextSendAt.getTime(), policy.nextAllowedAt.getTime(), 'Respect the transport interval');
    assert.equal(job.status, 'QUEUED'); assert.equal(job.messageId, options.job?.messageId ?? null);
    assert.equal(usage.attempts, options.usage?.attempts ?? 45, 'Recovery must not reset usage');
    await recovery.recoverQuotaDispatches(now);
    assert.equal(reads, 1, 'Already awakened jobs must not repeatedly reset sender cooldown');
  }
}
(async () => {
  await scenario(); // Global 45 -> 50, including previously persisted sleeps.
  await scenario({ globalQuota: 45, blocked: true });
  await scenario({ globalQuota: 40, blocked: true });
  await scenario({ usage: { attempts: 50 }, blocked: true });
  await scenario({ policy: { useGlobalQuota: false }, blocked: true });
  await scenario({ policy: { useGlobalQuota: false, dailyLimit: 50 } });
  await scenario({ policy: { paused: true }, blocked: true });
  await scenario({ usage: { failures: 20 }, blocked: true });
  await scenario({ active: true, blocked: true });
  await scenario({ policy: { warmupStartedAt: new Date('2026-10-19T00:00:00Z') }, blocked: true });
  await scenario({ policy: { warmupStartedAt: new Date('2026-10-19T00:00:00Z') }, warmupLimits: [50, 100] });
  await scenario({ job: { messageId: 'existing-safe-retry' } });
  console.log('QUOTA_RECOVERY_OK: global/custom increases, exhausted/reduced limits, warmup, pauses, active leases, interval, existing retries and confirmed-job protection.');
})().catch(error => { console.error(error); process.exitCode = 1; });
