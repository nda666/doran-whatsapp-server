const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

(async () => {
  const phones = new Map([
    ['offline', { isOnline: false }], ['online', { isOnline: true }],
    ['one-day', { isOnline: false }], ['warming', { isOnline: false }],
    ['none', { isOnline: false }],
  ]);
  const originalStart = new Date('2026-10-01T00:00:00Z');
  const policies = new Map([['warming', { warmupStartedAt: originalStart }],
    ['offline', { warmupStartedAt: null, dailyLimit: 123, paused: true }]]);
  const groupQueries = [], timers = [], files = new Map();
  let fail = false, groups = 0;
  const tx = {
    $queryRaw: async () => [],
    phone: { findUnique: async ({ where }) => phones.get(where.id) },
    deviceSendPolicy: {
      findUnique: async ({ where }) => policies.get(where.phoneId),
      upsert: async ({ where, create }) => { if (!policies.has(where.phoneId)) policies.set(where.phoneId, create); },
      updateMany: async ({ where, data }) => {
        const policy = policies.get(where.phoneId);
        if (policy.warmupStartedAt) return { count: 0 };
        Object.assign(policy, data); return { count: 1 };
      },
    },
  };
  const prisma = {
    $transaction: async fn => fn(tx),
    phone: { findMany: async () => Array.from(phones.keys(), id => ({ id })) },
    waDispatch: { groupBy: async query => {
      if (fail) throw new Error('DB unavailable');
      groupQueries.push(query);
      const ids = groups++ % 2 === 0 ? ['offline', 'online', 'one-day', 'warming'] : ['offline', 'online', 'warming'];
      return ids.map(phoneId => ({ phoneId, _count: { _all: 2 } }));
    } },
  };
  const env = { WHATSAPP_ENABLED: 'true' };
  const exports = {};
  const mocks = {
    'node:path': require('node:path'), '../../lib/prisma': { prisma },
    'node:fs/promises': {
      mkdir: async () => {},
      readFile: async path => { if (!files.has(path)) throw Object.assign(new Error(), { code: 'ENOENT' }); return files.get(path); },
      writeFile: async (path, data) => files.set(path, data),
      rename: async (from, to) => { files.set(to, files.get(from)); files.delete(from); },
    },
  };
  const code = ts.transpileModule(fs.readFileSync('src/server/messaging/dailyWarmup.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, { exports, require: name => { assert(name in mocks, name); return mocks[name]; },
    process: { env, cwd: () => '/app' }, Date, Map, console: { info() {}, error() {} },
    setTimeout: (fn, delay) => { const timer = { fn, delay, unref() {} }; timers.push(timer); return timer; },
    clearTimeout: timer => { timer.cleared = true; },
  });
  const { evaluationWindow, evaluateDailyWarmup, startDailyWarmup } = exports;
  const window = evaluationWindow(new Date('2026-10-19T17:00:00Z'));
  assert.equal(window.day, '2026-10-20');
  assert.equal(window.start.toISOString(), '2026-10-17T17:00:00.000Z');
  assert.equal(window.middle.toISOString(), '2026-10-18T17:00:00.000Z');
  assert.equal(window.end.toISOString(), '2026-10-19T17:00:00.000Z');
  assert.equal(evaluationWindow(new Date('2026-10-19T16:59:59Z')).day, '2026-10-19');
  assert.equal(evaluationWindow(new Date('2026-01-01T17:00:00Z')).start.toISOString(), '2025-12-30T17:00:00.000Z');
  const report = await evaluateDailyWarmup(new Date('2026-10-19T17:00:00Z'));
  assert.equal(report.results.find(r => r.phoneId === 'offline').outcome, 'started');
  assert.equal(report.results.find(r => r.phoneId === 'online').outcome, 'ineligible');
  assert.equal(report.results.find(r => r.phoneId === 'one-day').outcome, 'ineligible');
  assert.equal(report.results.find(r => r.phoneId === 'none').outcome, 'ineligible');
  assert.equal(report.results.find(r => r.phoneId === 'warming').outcome, 'already_warming');
  assert.equal(policies.get('warming').warmupStartedAt, originalStart);
  assert.equal(policies.get('offline').dailyLimit, 123);
  assert.equal(policies.get('offline').paused, true);
  assert.equal(groupQueries[0].where.sentAt.gte.toISOString(), window.start.toISOString());
  assert.equal(groupQueries[0].where.sentAt.lt.toISOString(), window.middle.toISOString());
  assert.equal(groupQueries[1].where.sentAt.lt.toISOString(), window.end.toISOString());
  assert.equal((await evaluateDailyWarmup()).results.filter(r => r.outcome === 'started').length, 0);
  const flush = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };
  let stop = startDailyWarmup();
  assert.equal(timers.at(-1).delay, 60000);
  timers.at(-1).fn(); await flush();
  assert.equal(files.size, 1, 'atomic persistent completion report');
  assert(timers.at(-1).delay > 0 && timers.at(-1).delay <= 86400000);
  await stop(); assert(timers.at(-1).cleared);
  const calls = groupQueries.length;
  stop = startDailyWarmup(); timers.at(-1).fn(); await flush();
  assert.equal(groupQueries.length, calls, 'restart must skip a completed day'); await stop();
  files.clear(); fail = true;
  stop = startDailyWarmup(); timers.at(-1).fn(); await flush();
  assert.equal(files.size, 0, 'failure must not mark evaluation complete');
  assert.equal(timers.at(-1).delay, 60000, 'retry failed evaluation'); await stop();
  env.WHATSAPP_ENABLED = 'false'; const totalTimers = timers.length;
  await startDailyWarmup()(); assert.equal(timers.length, totalTimers);
  console.log('DAILY_WARMUP_TESTS_PASSED');
})().catch(error => { console.error(error); process.exit(1); });
