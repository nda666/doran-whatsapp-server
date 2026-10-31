'use strict';
// Offline audit tests: synthetic time, memory ledger, no WhatsApp or production DB.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
class GuardError extends Error { constructor(code, retryAt) { super(code); this.code = code; this.retryAt = retryAt; } }
function load(file, dependencies = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => {
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    if (name.startsWith('node:')) return require(name);
    if (name === './safety') return { SendGuardError: GuardError };
    if (name === '../../lib/prisma') return { prisma: {} };
    throw Error('Unexpected dependency: ' + name);
  }, module, module.exports);
  return module.exports;
}
(async () => {
  const traffic = load('src/server/messaging/trafficGuard.ts'), fence = load('src/server/messaging/sendFence.ts');
  assert.equal(traffic.configuredTrafficPolicy({}), null);
  assert.deepEqual(traffic.configuredTrafficPolicy({ WA_TRAFFIC_GUARD_ENABLED: 'true' }), { maxPerMinute: 15, identicalPerHour: 4 });
  for (const value of ['0', '7', '16', '8.5', 'bad']) assert.throws(() => traffic.configuredTrafficPolicy({ WA_TRAFFIC_GUARD_ENABLED: 'true', WA_MAX_PER_MINUTE: value }));
  const policy = { maxPerMinute: 15, identicalPerHour: 4 }, now = 10_000_000;
  const empty = { minuteAttempts: 0, oldestMinuteAt: null, sameContent: [], connectedAt: null };
  const check = snapshot => traffic.evaluateTraffic(policy, { ...empty, ...snapshot }, 'new', now, 1200);
  assert.equal(check({}).minimumIntervalMs, 5200, '1.2s jitter is added to 4s minimum; it cannot override RPM pacing');
  assert.equal(check({ minuteAttempts: 15, oldestMinuteAt: now - 59000 }).retryAt, now + 1000);
  assert.equal(check({ connectedAt: now }).retryAt, now + 30000);
  assert.equal(check({ connectedAt: now - 30000 }).minimumIntervalMs, 13200);
  assert.equal(check({ connectedAt: now - 60000 }).minimumIntervalMs, 7200);
  assert.equal(check({ connectedAt: now - 120000 }).minimumIntervalMs, 5200);
  const same = [1, 2, 3, 4].map(id => ({ logicalId: String(id), lastAt: now - id * 1000 }));
  assert.equal(check({ sameContent: same }).reason, 'IDENTICAL_HOURLY_LIMIT');
  assert.equal(traffic.evaluateTraffic(policy, { ...empty, sameContent: same }, '1', now, 1200).retryAt, null, 'Retry of the same logical message is not a new identical message');
  assert.equal(check({ minuteAttempts: 15, oldestMinuteAt: now - 1000, sameContent: same }).reason, 'IDENTICAL_HOURLY_LIMIT', 'Use the longest applicable wait');
  const hash = traffic.trafficContentHash;
  assert.equal(hash({ text: 'hello', image: Buffer.from('a') }), hash({ image: Buffer.from('a'), text: 'hello' }));
  assert.notEqual(hash({ text: 'hello', image: Buffer.from('a') }), hash({ text: 'hello', image: Buffer.from('b') }));
  assert.notEqual(hash({ image: { url: new URL('https://example.com/a') } }), hash({ image: { url: new URL('https://example.com/b') } }));
  assert.throws(() => hash({ image: { pipe() {} } }), /STREAM_NEEDS/);
  const cycle = {}; cycle.self = cycle; assert.throws(() => hash(cycle), /CYCLE/);
  assert.deepEqual(Array.from({ length: 7 }, (_, day) => traffic.sevenDayWarmupLimit(new Date(0), 1000, day * 86400000)), [20, 36, 65, 117, 210, 378, 680]);
  assert.equal(traffic.sevenDayWarmupLimit(new Date(0), 50, 6 * 86400000), 50);
  assert.equal(traffic.sevenDayWarmupLimit(null, 50), 50);
  console.log('PASS disabled-by-default, configuration, rolling rate window, jitter floor, reconnect ramp, identical cap/retry identity, safe content hashing, clamped 7-day policy');

  let ledger = [], chain = Promise.resolve();
  const tx = {
    $queryRaw: async (parts, ...values) => {
      const sql = parts.join('?');
      if (sql.includes('FOR UPDATE')) return [{ phoneId: values[0] }];
      if (sql.includes('wa_send_recovery')) return [];
      if (sql.includes('COUNT(*)')) { const rows = ledger.filter(x => x.phoneId === values[0] && x.at > values[1]); return [{ total: BigInt(rows.length), oldest: rows[0]?.at || null }]; }
      if (sql.includes('GROUP BY logicalId')) {
        const groups = new Map();
        for (const row of ledger.filter(x => x.phoneId === values[0] && x.hash === values[1] && x.at > values[2])) groups.set(row.logicalId, row.at);
        return [...groups].map(([logicalId, lastAt]) => ({ logicalId, lastAt }));
      }
      throw Error('Unexpected query');
    },
    $executeRaw: async (_parts, ...values) => { ledger.push({ phoneId: values[1], logicalId: values[2], hash: values[3], at: values[4] }); return 1; },
  };
  const transaction = fn => { const next = chain.then(async () => { const before = [...ledger]; try { return await fn(tx); } catch (e) { ledger = before; throw e; } }); chain = next.catch(() => {}); return next; };
  const outcomes = await Promise.allSettled(Array.from({ length: 30 }, (_, index) => transaction(db => traffic.reserveTraffic(db, 'phone', { logicalId: String(index), contentHash: hash({ text: String(index) }) }, policy, new Date(now)))));
  assert.equal(outcomes.filter(x => x.status === 'fulfilled').length, 15);
  assert.equal(ledger.length, 15);
  await assert.rejects(transaction(db => traffic.reserveTraffic(db, 'phone', { logicalId: '1', contentHash: hash({ text: '1' }) }, policy, new Date(now))), e => e.code === 'DEVICE_THROTTLED');
  await assert.rejects(transaction(async db => { await traffic.reserveTraffic(db, 'different', { logicalId: 'x', contentHash: hash({ text: 'x' }) }, policy, new Date(now)); throw Error('Daily quota rejects the entire transaction'); }));
  assert.equal(ledger.length, 15, 'A later quota failure rolls back the traffic admission too');
  ledger = [];
  for (let i = 0; i < 4; i++) await transaction(db => traffic.reserveTraffic(db, 'p', { logicalId: String(i), contentHash: hash({ text: 'same' }) }, policy, new Date(now)));
  await assert.rejects(transaction(db => traffic.reserveTraffic(db, 'p', { logicalId: '5', contentHash: hash({ text: 'same' }) }, policy, new Date(now))), e => e.retryAt.getTime() === now + 3600000);
  await transaction(db => traffic.reserveTraffic(db, 'p', { logicalId: '0', contentHash: hash({ text: 'same' }) }, policy, new Date(now)));
  assert.equal(ledger.length, 5, 'Logical retry still consumes one physical attempt');
  console.log('PASS concurrent admission using a transaction fixture, rate counting of retries, hourly content cap, quota rollback; real MySQL adapter remains an activation check');

  let release, secondStarted = false;
  const first = traffic.serializePhoneSend('serial', () => new Promise(resolve => { release = resolve; }));
  await Promise.resolve();
  await assert.rejects(Promise.race([first, Promise.reject(Error('caller timed out'))]));
  const second = traffic.serializePhoneSend('serial', async () => { secondStarted = true; return 2; });
  await Promise.resolve(); assert.equal(secondStarted, false, 'Caller timeout does not release real transport lock');
  assert.equal(await traffic.serializePhoneSend('independent', async () => 3), 3, 'Different devices remain independent');
  release(1); assert.equal(await first, 1); assert.equal(await second, 2);
  const order = [];
  await Promise.allSettled([traffic.serializePhoneSend('fifo', async () => { order.push(1); throw Error('first failed'); }), traffic.serializePhoneSend('fifo', async () => order.push(2)), traffic.serializePhoneSend('fifo', async () => order.push(3))]);
  assert.deepEqual(order, [1, 2, 3]);
  let free;
  const occupied = traffic.serializePhoneSend('bounded', () => new Promise(resolve => { free = resolve; }), 1);
  await Promise.resolve();
  await assert.rejects(traffic.serializePhoneSend('bounded', async () => 0, 1), e => e.code === 'DEVICE_THROTTLED');
  free(); await occupied;
  console.log('PASS FIFO physical transport serialization, failure recovery, bounded waiters, real-promise ownership after caller timeout');

  await fence.assertSendFence();
  await assert.rejects(fence.withSendFence({ deadlineAt: Date.now() - 1, isCurrent: async () => true }, () => fence.assertSendFence()), e => e.code === 'DEVICE_THROTTLED');
  await assert.rejects(fence.withSendFence({ deadlineAt: Date.now() + 60000, isCurrent: async () => false }, () => fence.assertSendFence()), e => e.code === 'DEVICE_THROTTLED');
  await Promise.all([fence.withSendFence({ deadlineAt: Date.now() + 60000, isCurrent: async () => true }, () => fence.assertSendFence()), assert.rejects(fence.withSendFence({ deadlineAt: 0, isCurrent: async () => true }, () => fence.assertSendFence()))]);
  console.log('PASS preflight deadline/lease fencing and async context isolation; no claim of cancellation once native transport starts');
  class ControlAuthError extends Error { constructor(status, message) { super(message); this.status = status; } }
  let identity = { mode: 'device', device: { id: 'phone' } }, ownerDenied = false;
  const control = load('src/server/dispatchControlAuth.ts', { './dispatchAuth': {
    DispatchAuthError: ControlAuthError,
    resolveIntegrationIdentity: async () => { if (ownerDenied) throw new ControlAuthError(403, 'Owner disabled'); return identity; },
  } });
  assert.equal((await control.resolveControlDevice({ headers: {}, query: {} }, {})).id, 'phone');
  identity = { mode: 'user', device: null };
  await assert.rejects(control.resolveControlDevice({ headers: {}, query: {} }, {}), e => e.status === 401);
  ownerDenied = true;
  await assert.rejects(control.resolveControlDevice({ headers: {}, query: {} }, {}), e => e.status === 403);
  console.log('PASS control endpoint adapter reuses owner approval checks and still requires a device token');
})().catch(error => { console.error(error); process.exitCode = 1; });
