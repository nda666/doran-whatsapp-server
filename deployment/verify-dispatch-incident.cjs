'use strict';
// No production DB, sockets, API requests, or outbound messages.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/server/dispatch/worker.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true } }).outputText;
const intervals = new Map(), logs = [], writes = [], filters = [];
let intervalId = 0, polls = 0, releases = [], online = false, claimCount = 0, sends = 0;
const job = { id: 'job-1', phoneId: 'sender-1', userId: 'u', attempts: 0, campaignId: null, messageId: null, recipient: 'mock', message: 'not logged' };
const db = {
  waSenderLease: {
    updateMany: async args => { if (args.data.nextSendAt) releases.push(args.data.nextSendAt); return { count: 1 }; },
    findFirst: async () => ({ phoneId: 'sender-1' }),
  },
  phone: { findUnique: async () => ({ active: 1 }) },
  waDispatch: { findFirst: async args => { filters.push(args.where); return job; } },
  $executeRaw: async (parts, ...params) => { writes.push({ sql: parts.join('?'), params }); return 1; },
  $queryRaw: async parts => { polls++; const sql = parts.join('?');
    if (sql.includes('COUNT(*) AS jobs')) return [{ phoneId: 'sender-1', jobs: 1, oldest: new Date(Date.now() - 360000), nextDue: new Date(0) }];
    assert.match(sql, /JOIN wa_sender_leases/);
    assert.match(sql, /l.nextSendAt <=/);
    assert.match(sql, /l.leaseUntil IS NULL/);
    return []; },
  $transaction: async fn => fn(db),
};
const socket = { ws: { get isOpen() { return online; } }, user: { id: 'mock' },
  waitForMessage: async () => ({ tag: 'ack', attrs: {} }),
  sendMessage: async () => { sends++; return { key: { id: 'message-1' } }; },
};
const updates = [];
const stubs = {
  '../dispatchWebhook/events': { updateDispatches: async args => {
    updates.push(args);
    if (args.data.status === 'UNCERTAIN' && args.data.lastError === 'WORKER_INTERRUPTED_CHECK_RECIPIENT') {
      const error = Object.assign(new Error('secret payload must not be logged'), { code: 'P2028', meta: { code: '1213' } }); throw error;
    }
    return { count: claimCount };
  } },
  '../../lib/prisma': { prisma: db },
  '../libs/makeWASocket': { session: new Map([['sender-1', socket]]) },
  '@whiskeysockets/baileys': { generateMessageIDV2: () => 'message-1' },
  './media': {}, '../campaigns/media': {}, '../campaigns/content': {},
};
const mod = { exports: {} };
new Function('require', 'module', 'exports', 'setInterval', 'clearInterval', 'console', code)(
  name => Object.hasOwn(stubs, name) ? stubs[name] : require(name), mod, mod.exports,
  fn => { const id = ++intervalId; intervals.set(id, fn); return id; }, id => intervals.delete(id),
  { info: (...args) => logs.push(args.join(' ')), error: (...args) => logs.push(args.join(' ')) });
(async () => {
  const before = Date.now();
  await mod.exports.processPhone('sender-1');
  assert.equal(sends, 0);
  assert.equal(writes.length, 1);
  assert.match(writes[0].sql, /FORCE INDEX \(wa_dispatches_phoneId_status_createdAt_idx\)/);
  assert.match(writes[0].sql, /lastError IS NULL OR lastError <>/);
  assert.match(writes[0].sql, /LIMIT 250/);
  assert(releases.at(-1).getTime() >= before + 30000);
  online = true; claimCount = 0;
  await mod.exports.processPhone('sender-1');
  assert.equal(sends, 0, 'Failed atomic claim must not send');
  for (const key of ['messageId', 'sentAt', 'deliveredAt', 'readAt']) assert.equal(filters[0][key], null);
  const claim = updates.find(x => x.data.status === 'PROCESSING');
  assert.equal(claim.where.messageId, null);
  assert(claim.where.expiresAt.gt instanceof Date);
  const stop = mod.exports.startDispatchWorker();
  for (let i = 0; i < 20; i++) await Promise.resolve();
  assert(polls > 0, 'Recovery rejection must not block polling');
  assert(logs.some(x => x.includes('DISPATCH_RECOVERY_FAILED') && x.includes('P2028') && x.includes('1213')));
  assert(!logs.some(x => x.includes('secret payload')));
  const health = mod.exports.getDispatchHealth();
  assert(health.metrics.worker_last_poll_success);
  assert.equal(health.metrics.connected_socket_count, 1);
  assert(health.alerts.includes('BACKLOG_AGE_EXCEEDED'));
  const future = mod.exports.getDispatchHealth(Date.now() + 121000);
  assert(future.alerts.includes('POLL_STALE'));
  assert(future.alerts.includes('CLAIM_STALLED'));
  online = false;
  assert(mod.exports.getDispatchHealth().alerts.includes('SENDER_OFFLINE_WITH_BACKLOG'));
  await stop(); assert.equal(intervals.size, 0);
  console.log('PASS: bounded sender update; cooldown; ambiguous-send guards; recovery isolation; safe diagnostics; shutdown');
})().catch(e => { console.error(e); process.exitCode = 1; });
