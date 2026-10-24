'use strict';
// Synthetic clock, in-memory DB and mock transport; never sends real messages.
process.env.WHATSAPP_ENABLED = 'true';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
let now = Date.now(), row, sends, mode, timers, pendingAck, beforeRead, beforeClaim, blockSenderTurn;
class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
function matches(item, where = {}) {
  return Object.entries(where).every(([key, val]) => {
    if (key === 'AND') return val.every(v => matches(item, v));
    if (key === 'OR') return val.some(v => matches(item, v));
    const actual = item[key];
    if (val && typeof val === 'object' && !(val instanceof Date)) return Object.entries(val).every(([op, v]) =>
      ({ in: () => v.includes(actual), notIn: () => !v.includes(actual), not: () => actual !== v,
        gt: () => actual > v, lte: () => actual <= v })[op]());
    return actual === val;
  });
}
const transitions = [];
async function update({ where, data }) {
  if (!row || !matches(row, where)) return { count: 0 };
  for (const [key, value] of Object.entries(data)) row[key] = value?.increment ? row[key] + value.increment : value;
  transitions.push(row.status); return { count: 1 };
}
const prisma = {
  recipientSuppression: { findUnique: async () => null },
  waSenderLease: { createMany: async () => ({ count: 1 }), updateMany: async () => ({ count: 1 }), findFirst: async () => ({}) },
  phone: { findUnique: async () => ({ id: 'phone', userId: 'owner', active: 1, showTyping: true }), findMany: async ({ where }) => [{ id: where.id || 'phone', userId: 'owner', active: 1, showTyping: true }] },
  deviceSendPolicy: { findUnique: async () => null, updateMany: async () => ({ count: 1 }) },
  deviceDailyUsage: { updateMany: async () => ({ count: 1 }) },
  waDispatchAttempt: { create: async () => ({ id: 'attempt' }), updateMany: async () => ({ count: 1 }) },
  waDispatch: {
    findFirst: async ({ where, select }) => select?.id && blockSenderTurn ? { id: 'earlier-job-on-actual-sender' } : matches(row, where) ? { ...row } : null,
    findUnique: async () => { if (beforeRead) { const fn = beforeRead; beforeRead = null; await fn(); } return { ...row }; },
  },
  campaign: { updateMany: async () => ({ count: 0 }) },
  $transaction: async fn => { if (beforeClaim) { const hook = beforeClaim; beforeClaim = null; await hook(); } return fn(prisma); }, $executeRaw: async () => 0,
};
const socket = {
  ws: { isOpen: true }, user: { id: 'mock' }, sendPresenceUpdate: async () => {},
  waitForMessage: () => new Promise(resolve => { pendingAck = resolve; }),
  sendMessage: async (_, content, options) => {
    sends.push(options.messageId);
    if (mode === 'error') throw new Error('NETWORK_ERROR');
    if (mode === 'ack') pendingAck({ tag: 'ack', attrs: {} });
    if (mode === 'invalid') pendingAck({ tag: 'receipt', attrs: {} });
    if (mode === 'temporary') pendingAck({ tag: 'ack', attrs: { error: '479' } });
    if (mode === 'permanent') pendingAck({ tag: 'ack', attrs: { error: '463' } });
    return { key: { id: options.messageId } };
  },
};
const stubs = {
  'src/lib/prisma.ts': { prisma },
  'src/server/dispatchWebhook/events.ts': { updateDispatches: update },
  'src/server/libs/makeWASocket.ts': { session: new Map([['phone', socket], ['backup', socket]]) },
  'src/server/dispatch/settings.ts': { getGlobalOperatingHours: async () => ({ enabled: false, start: '08:00', end: '20:00' }), getDispatchAgeCutoff: async () => new Clock(0), getDispatchQueueOrder: async () => 'oldest', getDispatchDelayRange: async () => ({ minSeconds: 1, maxSeconds: 1 }), dispatchDeadline: () => ({}) },
  'src/server/dispatch/media.ts': {}, 'src/server/campaigns/media.ts': {}, 'src/server/campaigns/content.ts': {},
};
const cache = {};
function load(name) {
  if (stubs[name]) return stubs[name];
  if (cache[name]) return cache[name];
  const module = { exports: {} };
  cache[name] = module.exports;
  const code = ts.transpileModule(fs.readFileSync(path.join(root, name), 'utf8'), { compilerOptions: { module: 1, target: 7, esModuleInterop: true } }).outputText;
  const req = spec => {
    if (spec === '@whiskeysockets/baileys') return { generateMessageIDV2: () => 'stable-message-id' };
    if (!spec.startsWith('.')) return require(spec);
    return load(path.posix.normalize(path.posix.join(path.posix.dirname(name), spec)) + '.ts');
  };
  new Function('require', 'module', 'exports', 'Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', code)(
    req, module, module.exports, Clock,
    (fn, ms) => { const timer = { fn, ms }; timers.add(timer); return timer; }, timer => timers.delete(timer), () => 1, () => {});
  cache[name] = module.exports; return module.exports;
}
timers = new Set();
const retry = load('src/server/dispatch/retry.ts');
const worker = load('src/server/dispatch/worker.ts');
const receipts = load('src/server/dispatch/receipts.ts');
function reset() {
  row = { id: 'dispatch', phoneId: 'phone', senderPhoneId: null, senderGroupId: null, source: 'API', status: 'QUEUED', messageId: null, sentAt: null, deliveredAt: null, readAt: null,
    attempts: 0, nextAttemptAt: new Clock(0), createdAt: new Clock(now - 1000), lastError: null, recipient: 'mock', message: 'test', campaignId: null };
  sends = []; mode = 'timeout'; timers.clear(); beforeRead = null; beforeClaim = null; blockSenderTurn = false;
}
const flush = () => new Promise(resolve => setImmediate(resolve));
async function timeoutAttempt() {
  const running = worker.processPhone('phone'); await flush();
  const timeout = [...timers].find(t => t.ms === 40000); assert(timeout, '40s timer registered');
  now += 40000; timeout.fn(); await running;
}
(async () => {
  reset();
  for (let attempt = 1; attempt <= 5; attempt++) {
    await timeoutAttempt(); assert.equal(row.attempts, attempt);
    assert.equal(row.status, attempt === 5 ? 'FAILED' : 'QUEUED');
    if (attempt < 5) {
      assert.equal(row.nextAttemptAt.getTime() - now, [60000, 120000, 240000, 480000][attempt - 1]);
      await worker.processPhone('phone'); assert.equal(sends.length, attempt, 'no premature retry');
      now = row.nextAttemptAt.getTime();
    }
  }
  await worker.processPhone('phone'); assert.equal(sends.length, 5, 'no sixth send');
  assert.equal(new Set(sends).size, 1, 'same message ID on every attempt');
  assert.equal(row.lastError, retry.ACK_EXHAUSTED_ERROR);
  await receipts.recordDispatchReceipt('phone', row.messageId, 2); assert.equal(row.status, 'SENT', 'late server ACK after exhaustion');
  reset(); await timeoutAttempt();
  pendingAck({ tag: 'ack', attrs: {} }); await flush(); assert.equal(row.status, 'SENT', 'late direct ACK cancels retry');
  now += 100000; await worker.processPhone('phone'); assert.equal(sends.length, 1);
  for (const level of [2, 3, 4]) {
    reset(); await timeoutAttempt(); await receipts.recordDispatchReceipt('phone', row.messageId, level);
    const status = row.status; now += 100000; await worker.processPhone('phone');
    assert.equal(sends.length, 1); assert.equal(status, { 2: 'SENT', 3: 'DELIVERED', 4: 'READ' }[level]);
    await receipts.recordDispatchReceipt('phone', row.messageId, 2); assert.equal(row.status, status, 'never downgrade receipts');
  }
  reset(); await timeoutAttempt(); now = row.nextAttemptAt.getTime();
  beforeRead = () => receipts.recordDispatchReceipt('phone', row.messageId, 3);
  await worker.processPhone('phone'); assert.equal(sends.length, 1, 'receipt during claim cancels send');

  for (const badMode of ['invalid', 'temporary']) {
    reset(); mode = badMode;
    const running = worker.processPhone('phone'); await flush();
    assert.equal(row.status, 'PROCESSING', 'bad ACK must wait for the deadline');
    assert.equal(row.attempts, 1);
    now += 40000; [...timers].find(t => t.ms === 40000).fn(); await running;
    assert.equal(row.status, 'QUEUED', 'bad ACK is retried, not UNCERTAIN');
    assert.equal(row.nextAttemptAt.getTime() - now, 60000);
    pendingAck({ tag: 'ack', attrs: {} }); await flush();
    assert.equal(row.status, 'SENT', 'valid ACK after bad ACK still confirms send');
  }
  reset(); mode = 'invalid';
  const corrected = worker.processPhone('phone'); await flush();
  pendingAck({ tag: 'ack', attrs: {} }); await corrected;
  assert.equal(row.status, 'SENT', 'valid ACK before deadline cancels timeout');
  reset(); mode = 'permanent'; await worker.processPhone('phone');
  assert.equal(row.status, 'FAILED'); assert.equal(row.lastError, 'WA_ACK_463_ACCOUNT_RESTRICTED');
  await worker.processPhone('phone'); assert.equal(sends.length, 1, 'no retry of account restriction');
  reset(); mode = 'ack'; await worker.processPhone('phone'); assert.equal(row.status, 'SENT');
  reset(); mode = 'error'; await worker.processPhone('phone'); assert.equal(row.status, 'UNCERTAIN', 'early transport failure does not retry');
  reset(); row.status = 'UNCERTAIN'; await worker.processPhone('phone'); assert.equal(sends.length, 0, 'old uncertain not replayed');
  reset(); row.messageId = 'unexplained'; await worker.processPhone('phone'); assert.equal(sends.length, 0, 'unmarked queued send excluded');
  reset(); mode = 'ack';
  beforeClaim = () => { row.senderPhoneId = 'backup'; };
  await worker.processPhone('phone');
  assert.equal(sends.length, 0, 'Stale origin claim cannot send after manual reassignment');
  assert.equal(row.status, 'QUEUED'); assert.equal(row.attempts, 0);
  await worker.processPhone('phone');
  assert.equal(row.status, 'SENT'); assert.equal(row.phoneId, 'phone'); assert.equal(row.senderPhoneId, 'backup');
  assert.equal(sends.length, 1, 'Reassigned message sent once by backup through the normal worker');
  reset(); mode = 'ack'; row.senderPhoneId = 'backup'; blockSenderTurn = true;
  await worker.processPhone('phone');
  assert.equal(sends.length, 0, 'Reassigned job respects the actual sender queue order');
  assert.equal(row.attempts, 0); assert.equal(row.status, 'QUEUED');
  assert.equal(timers.size, 0);
  console.log('ACK_RETRY_TESTS_PASSED: 40s timeout, 1/2/4/8m schedule, five-attempt cap, stable IDs, no premature retry, late ACK/receipts, race cancellation, invalid/temporary ACKs, permanent 463 rejection, normal success, early errors and old UNCERTAIN preserved');
})().catch(error => { console.error(error); process.exitCode = 1; });
