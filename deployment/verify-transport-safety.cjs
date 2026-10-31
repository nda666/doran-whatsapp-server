'use strict';
// Real safety helpers and legacy callers, synthetic transports; no WhatsApp traffic.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
class SendGuardError extends Error { constructor(code, retryAt) { super(code); this.code = code; this.retryAt = retryAt; } }
function load(file, mocks = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith('node:') || name === 'fs' || name === 'zod') return require(name);
    if (name === './safety') return { SendGuardError };
    throw Error('Unexpected dependency: ' + name);
  }, module, module.exports);
  return module.exports;
}
(async () => {
  let id = 0;
  const transport = load('src/server/messaging/transportSafety.ts', { '@whiskeysockets/baileys': { generateMessageIDV2: () => `id-${++id}` } });
  const fence = load('src/server/messaging/sendFence.ts');
  let release, starts = 0;
  const first = transport.serializeTransport('phone', () => { starts++; return new Promise(resolve => { release = resolve; }); });
  await Promise.resolve();
  await assert.rejects(Promise.race([first, Promise.reject(Error('caller timeout'))]));
  const second = transport.serializeTransport('phone', async () => { starts++; });
  await Promise.resolve(); assert.equal(starts, 1);
  assert.equal(await transport.serializeTransport('other', async () => 42), 42);
  release(); await first; await second; assert.equal(starts, 2);
  const order = [];
  await Promise.allSettled([transport.serializeTransport('fifo', async () => { order.push(1); throw Error('failed'); }), transport.serializeTransport('fifo', async () => order.push(2))]);
  assert.deepEqual(order, [1, 2]);
  const blocked = transport.serializeTransport('bounded', () => new Promise(resolve => { release = resolve; }), 1);
  await Promise.resolve(); await assert.rejects(transport.serializeTransport('bounded', async () => {}, 1), e => e.code === 'DEVICE_THROTTLED');
  release(); await blocked;

  const held = transport.serializeTransport('fenced', () => new Promise(resolve => { release = resolve; }));
  await Promise.resolve();
  let valid = true, physical = 0;
  const late = fence.withSendFence({ deadlineAt: Date.now() + 60000, isCurrent: async () => valid },
    () => transport.serializeTransport('fenced', async () => { await fence.assertSendFence(); physical++; }));
  valid = false; release(); await held;
  await assert.rejects(late, e => e.code === 'DEVICE_THROTTLED'); assert.equal(physical, 0);
  await assert.rejects(fence.withSendFence({ deadlineAt: 0, isCurrent: async () => true }, () => fence.assertSendFence()));
  await fence.assertSendFence();
  console.log('PASS real transport serialization, caller timeout, independent devices, bounded queue, failed-send recovery and queued-send fencing');

  const closed = Object.assign(Error('connection closed'), { output: { statusCode: 428 } });
  const attempt = transport.createLegacySendAttempt();
  assert.equal(transport.canRetryLegacySend(attempt, closed, 0, 4), true);
  assert.equal(transport.canRetryLegacySend(attempt, closed, 4, 4), false);
  assert.equal(transport.canRetryLegacySend(attempt, Error('unknown'), 0, 4), false);
  transport.withLegacySendAttempt(attempt, () => transport.markLegacyTransportStarted());
  assert.equal(transport.canRetryLegacySend(attempt, closed, 0, 4), false);
  const isolated = transport.createLegacySendAttempt();
  assert.equal(isolated.transportStarted, false);

  for (const [file, input] of [
    ['sendMessageFromIo.ts', { tos: ['628123456789'], message: 'hello' }],
    ['sendGroupMessageFromIo.ts', { id_group: 'test@g.us', message: 'hello' }],
    ['sendAttachmentMessageIo.ts', { tos: ['628123456789'], caption: 'hello', image: 'https://example.invalid/pic.jpg' }],
  ]) {
    let sends = 0, sleeps = 0, preparation = 0;
    const ids = [];
    const socket = { groupMetadata: async () => { preparation++; if (preparation === 1) throw closed; return {}; },
      sendMessage: async (_jid, _content, options) => { sends++; ids.push(options.messageId); transport.markLegacyTransportStarted(); throw closed; } };
    const sender = load('src/server/libs/' + file, {
      '../messaging/transportSafety': transport,
      '@whiskeysockets/baileys': { delay: async () => { sleeps++; } },
      '../../utils/normalizePhoneRecipient': { normalizePhoneRecipient: value => value },
      './makeWASocket': { __esModule: true, default: async () => socket },
      './toBase64': { __esModule: true, default: async () => 'unused' },
    }).default;
    const idsBefore = id;
    await assert.rejects(sender({ phoneId: 'phone', userId: 'owner', phoneCountry: 'ID', ...input }), e => e === closed);
    assert.equal(sends, 1, file + ': ambiguous native failure cannot resend');
    assert.equal(sleeps, file.includes('Group') ? 1 : 0);
    assert.equal(id, idsBefore + 1, file + ': preparation retry preserves logical identity');
    assert.equal(ids[0], `id-${id}`);
  }
  console.log('PASS all three actual legacy senders: native 428 never blindly retries; safe group preflight retry retains message ID');

  const hours = load('src/lib/operatingHours.ts');
  const health = load('src/server/dispatch/health.ts', { '../../lib/operatingHours': hours });
  assert.equal(health.pollStaleAfter(75), 105000);
  assert.equal(health.pollStaleAfter(5), 60000);
  const now = Date.parse('2026-11-01T03:00:00Z'); // 10:00 WIB
  const row = { nextDue: new Date(now - 1000) }, globalHours = { enabled: true, start: '06:00', end: '23:00' };
  assert.equal(health.senderClaimDue(row, true, globalHours, now), true);
  assert.equal(health.senderClaimDue(row, false, globalHours, now), false);
  assert.equal(health.senderClaimDue({ ...row, paused: 1 }, true, globalHours, now), false);
  assert.equal(health.senderClaimDue({ ...row, readyAt: new Date(now + 1) }, true, globalHours, now), false);
  assert.equal(health.senderClaimDue(row, true, globalHours, Date.parse('2026-11-01T17:00:00Z')), false);
  assert.equal(health.senderClaimDue({ ...row, operatingHours: { enabled: false, start: '00:00', end: '01:00' } }, true, globalHours, Date.parse('2026-11-01T17:00:00Z')), true);
  console.log('PASS monitoring respects polling interval, offline/paused devices, lease/cooldown readiness and operating-hour overrides');

  const owner = { id: 'owner', isActive: true, approvalStatus: 'APPROVED' };
  const auth = load('src/server/dispatchAuth.ts', {
    '@/lib/prisma': { prisma: { phone: { findUnique: async ({ where }) => where.token === 'device-token' ? { id: 'phone', userId: 'owner' } : null },
      user: { findUnique: async ({ where }) => where.id === 'owner' ? owner : where.token === 'user-token' ? owner : null } } },
    '@/lib/access': load('src/lib/access.ts'),
  });
  const control = load('src/server/dispatchControlAuth.ts', { './dispatchAuth': auth });
  const req = { headers: {}, query: {} };
  assert.equal((await control.resolveControlDevice(req, { api_key: 'device-token' })).id, 'phone');
  owner.isActive = false;
  await assert.rejects(control.resolveControlDevice(req, { api_key: 'device-token' }), e => e.status === 403);
  owner.isActive = true; owner.approvalStatus = 'PENDING';
  await assert.rejects(control.resolveControlDevice(req, { api_key: 'device-token' }), e => e.status === 403);
  owner.approvalStatus = 'APPROVED';
  await assert.rejects(control.resolveControlDevice({ headers: { authorization: 'Bearer user-token' }, query: {} }, {}), e => e.status === 401);
  await assert.rejects(control.resolveControlDevice(req, { api_key: 'wrong-token' }), e => e.status === 401);
  console.log('PASS real control-auth resolver denies disabled/pending owners, invalid tokens and user-token control access');
})().catch(error => { console.error(error); process.exitCode = 1; });
