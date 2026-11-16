'use strict';
// Synthetic ledger only: no database connection or real messages.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
function load(file, dependencies) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  new Function('require', 'module', 'exports', code)(key => {
    if (key in dependencies) return dependencies[key];
    throw Error('Unexpected dependency ' + key);
  }, mod, mod.exports);
  return mod.exports;
}
const now = new Date('2026-11-16T12:00:00Z');
const policy = { enabled: true, recipientPerDay: 2, requireConsent: false };
let rows = [], owner = true, consent = true, updates = [];
function matches(row, where) {
  return Object.entries(where).every(([key, value]) => key === 'OR'
    ? value.some(branch => matches(row, branch))
    : value && typeof value === 'object' && !(value instanceof Date)
      ? Object.entries(value).every(([op, v]) => op === 'in' ? v.includes(row[key]) : op === 'gt' ? row[key] > v : false)
      // Deliberately emulate case/accent/trailing-space-insensitive MySQL equality.
      : key === 'message' ? row[key].localeCompare(value, 'en', { sensitivity: 'base' }) === 0 || row[key].trimEnd() === value.trimEnd()
      : row[key] === value);
}
const db = {
  user: { findUnique: async () => ({ allowed: owner }) },
  recipientConsent: { findFirst: async () => consent ? {} : null },
  waDispatch: {
    count: async () => 1,
    findMany: async ({ where, orderBy, take, cursor }) => {
      let found = rows.filter(row => matches(row, where));
      if (cursor) found = found.filter(row => row.id > cursor.id);
      found.sort((a, b) => orderBy.id ? a.id.localeCompare(b.id) : (a.sentAt?.getTime() || 0) - (b.sentAt?.getTime() || 0));
      return take ? found.slice(0, take) : found;
    },
    updateMany: async ({ where, data }) => {
      const found = rows.filter(row => matches(row, where));
      updates.push(...found.map(row => row.id)); found.forEach(row => Object.assign(row, data));
      return { count: found.length };
    },
  },
};
const recipient = load('src/server/messaging/recipientPolicy.ts', {
  '../../lib/prisma': { prisma: db }, '../../lib/access': { isApproved: row => row.allowed },
});
const recovery = load('src/server/dispatch/recipientRecovery.ts', {
  '../../lib/prisma': { prisma: db }, '../messaging/recipientPolicy': recipient,
  './settings': { getTrafficPolicy: async () => policy },
});
function sent(id, message = 'Invoice A', extra = {}) {
  return { id, userId: 'owner', recipient: 'recipient', message, status: 'DELIVERED',
    sentAt: new Date(now.getTime() - 3600000), ...extra };
}
const check = (message = 'Invoice A', p = policy) => recipient.recipientVerdict('owner', 'recipient', message, p, now);
(async () => {
  rows = [sent('1'), sent('2', 'Invoice A', { phoneId: 'another-sender' })];
  assert.equal((await check()).code, 'RECIPIENT_FREQUENCY', 'Identical messages share budget across senders');
  assert.equal((await check()).retryAt.getTime(), now.getTime() + 23 * 3600000);
  assert.equal(await check('Invoice B'), null, 'Different transaction text bypasses this limit');
  for (const text of ['invoice a', 'Invoice Á', 'Invoice A ', 'Invoice A\n', 'Invoice A\nextra']) {
    assert.equal(await check(text), null, 'Only exact text is identical: ' + JSON.stringify(text));
  }
  rows = [sent('0', 'invoice a'), sent('1', 'invoice a'), sent('2'), sent('3')];
  assert.equal((await check()).code, 'RECIPIENT_FREQUENCY', 'Collation candidates cannot consume a query take limit');
  rows = [sent('1'), sent('2', 'Invoice A', { sentAt: new Date(now.getTime() - 86400000) }),
    sent('3', 'Invoice A', { userId: 'other-owner' }), sent('4', 'Invoice A', { recipient: 'other-recipient' }),
    sent('5', 'Invoice A', { status: 'QUEUED' }), sent('6', 'Invoice A', { status: 'FAILED' })];
  assert.equal(await check(), null, 'Expired, unrelated, queued and failed rows do not count');
  rows.push(sent('7', 'Invoice A', { status: 'PROCESSING', sentAt: null }));
  assert.equal((await check()).code, 'RECIPIENT_FREQUENCY', 'In-flight identical message counts');
  assert.equal(await check('Invoice A', { ...policy, enabled: false }), null);
  owner = false; assert.equal((await check('Different')).code, 'ACCOUNT_INACTIVE'); owner = true;
  consent = false; assert.equal((await check('Different', { ...policy, requireConsent: true })).code, 'CONSENT_REQUIRED');
  consent = true;
  const sleeping = (id, extra = {}) => sent(id, 'Invoice B', { status: 'QUEUED', sentAt: null, deliveredAt: null, readAt: null,
    lastError: 'RECIPIENT_FREQUENCY', nextAttemptAt: new Date(now.getTime() + 86400000), ...extra });
  rows = [sent('s1'), sent('s2'), sleeping('blocked', { message: 'Invoice A' }),
    sleeping('confirmed', { sentAt: now }), sleeping('delivered', { deliveredAt: now }), sleeping('read', { readAt: now }),
    sleeping('processing', { status: 'PROCESSING' }), sleeping('other-error', { lastError: 'DEVICE_DAILY_LIMIT' })];
  for (let i = 0; i < 205; i++) rows.push(sleeping('wake-' + String(i).padStart(3, '0')));
  await recovery.recoverRecipientFrequencyDispatches(now);
  assert.equal(updates.length, 205, 'Recovery traverses batches even after waking rows');
  assert.ok(updates.every(id => id.startsWith('wake-')), 'Confirmed, processing and still blocked rows remain untouched');
  assert.ok(rows.filter(row => row.id.startsWith('wake-')).every(row => row.status === 'QUEUED' && row.nextAttemptAt === now && row.lastError === null));
  updates = []; await recovery.recoverRecipientFrequencyDispatches(now);
  assert.equal(updates.length, 0, 'Repeated recovery leaves already awakened rows alone');
  const worker = fs.readFileSync(path.resolve(__dirname, '../src/server/dispatch/worker.ts'), 'utf8');
  assert.match(worker, /recipientVerdict\(job.userId, job.recipient, job.message,/);
  assert.match(worker, /await recoverRecipientFrequencyDispatches\(\)/);
  console.log('RECIPIENT_FREQUENCY_OK: exact content, cross-sender budget, rolling window, guards and safe paginated recovery');
})().catch(error => { console.error(error); process.exitCode = 1; });
