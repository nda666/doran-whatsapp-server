'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, stubs = {}) {
  const source = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'process', source)(name => {
    assert(Object.hasOwn(stubs, name), 'Unexpected dependency: ' + name);
    return stubs[name];
  }, module, module.exports, { env: { WHATSAPP_ENABLED: 'true', DISPATCH_QUEUE_ENABLED: 'false' } });
  return module.exports;
}
const identity = load('src/server/libs/pairingIdentity.ts');
const A = '6281234567890', B = '6289999999999';
function simpleSocket(number = A) {
  return { user: number === null ? undefined : { id: number + ':7@s.whatsapp.net', name: 'Fixture' },
    ws: { isOpen: true, isClosed: false, isClosing: false } };
}
function fixture({ dbFailure = false, initialNumber = A } = {}) {
  globalThis.doranWaSessions = new Map();
  globalThis.doranPendingWaSockets = new Map();
  globalThis.doranAuthWrites = new WeakMap();
  identity.rejectedPairings.clear();
  const maintenance = new Set(), retired = new WeakSet(), events = [], writes = [], handlers = new Map();
  const recovery = { attempts: new Map(), timers: new Map(), blocked: new Set(), sockets: new WeakMap(), disconnects: new Map() };
  const phone = { id: 'phone', userId: 'owner', number: initialNumber, active: 1, isOnline: false, channel: 'whatsapp' };
  let transportSends = 0, reservations = 0, ended = 0, onReserve, onTransport;
  const socket = Object.assign(simpleSocket(null), {
    ev: { on(name, callback) { handlers.set(name, callback); } },
    authState: { creds: {} },
    sendMessage: async (...args) => { transportSends++; if (onTransport) return onTransport(...args); return { key: { id: 'fixture-message' } }; },
    end() { ended++; this.ws.isOpen = false; this.ws.isClosed = true; },
  });
  class SendGuardError extends Error { constructor(code) { super(code); this.code = code; } }
  const phoneDb = {
    findUnique: async () => phone,
    update: async ({ data }) => { writes.push(data); Object.assign(phone, data); return phone; },
    updateMany: async () => ({ count: 0 }),
  };
  const db = { phone: phoneDb, $transaction: async fn => {
    if (dbFailure) throw new Error('DB_OFFLINE');
    return fn({ deviceSendPolicy: { createMany: async () => ({ count: 1 }), updateMany: async () => ({ count: 1 }) }, phone: phoneDb });
  } };
  const updateDevice = async (_, scope, data) => {
    assert.deepEqual(scope, { id: 'phone', userId: 'owner' });
    writes.push(data); Object.assign(phone, data); return phone;
  };
  const socketModule = { __esModule: true };
  const connection = load('src/server/events/connectionUpdate.ts', {
    '../libs/waAuthState': { clearDatabaseAuth: async () => {} },
    fs: { rmSync() { throw new Error('Must not delete credentials'); } }, path: require('node:path'),
    '@whiskeysockets/baileys': { DisconnectReason: { loggedOut: 401, restartRequired: 515 } },
    '../../lib/prisma': { prisma: db }, '../constant': { WaSockQrTimeout: 60000 },
    '../libs/makeWASocket': socketModule,
    '../libs/socket': { emitDeviceEvent: async (...args) => events.push(args) },
    '../libs/pairingState': { recordPairingProgress: () => undefined },
    '../deviceWebhook/events': { updateDevice }, '../libs/phoneMaintenance': { phoneMaintenance: maintenance, retiredSockets: retired },
    '../libs/waRecoveryState': { waRecovery: recovery }, '../libs/pairingIdentity': identity,
  });
  const factory = load('src/server/libs/makeWASocket.ts', {
    './waAuthState': { closeDatabaseAuth: async () => {}, createDatabaseAuthState: async () => ({ state: {}, saveCreds: async () => {}, close: async () => {}, assertOwned: async () => {} }) },
    './waMessageStore': { groupMetadataCache: () => ({ get: async () => undefined, invalidate() {} }), getProtocolMessage: async () => undefined, storeProtocolMessage: async () => {} },
    '../messaging/transportSafety': load('src/server/messaging/transportSafety.ts', { 'node:async_hooks': require('node:async_hooks'), './safety': { SendGuardError }, '@whiskeysockets/baileys': { generateMessageIDV2: () => 'legacy-id' } }),
    '../messaging/sendFence': load('src/server/messaging/sendFence.ts', { 'node:async_hooks': require('node:async_hooks'), './safety': { SendGuardError } }),
    '../messaging/restrictions': { recordRestriction: async () => {}, refreshRestrictions: async () => {}, requireUnrestricted: async () => {} },
    'pino-pretty': {}, pino: () => ({}),
    '../messaging/safety': { SendGuardError, reserveSend: async () => { reservations++; await onReserve?.(); return 'day'; }, recipientBlocked: async () => false },
    '@whiskeysockets/baileys': { __esModule: true, default: async () => socket, useMultiFileAuthState: async () => ({ state: {}, saveCreds: async () => {} }) },
    '../../lib/prisma': { prisma: db }, '../../server/utils/getWaMessage': {}, '../../services/phone': { getPhoneById: async () => phone },
    '../constant': { WaSockQrTimeout: 60000 }, '../events/connectionUpdate': connection, './pairingIdentity': identity,
    '../events/handleMessageInEvent': {}, '../events/handleQuotedMessageEvent': {},
    '../utils/safeLinkPreview': {}, './qrState': { recordQrState() {} }, '../dispatch/receipts': {},
    '../campaigns/contacts': {}, '../utils/sendDeviceWebhook': {}, '../deviceWebhook/events': { updateDevice },
    './phoneMaintenance': { phoneMaintenance: maintenance, retiredSockets: retired }, './waRecoveryState': { waRecovery: recovery },
    '../chat/store': { captureChatMessage: async () => {} },
  });
  Object.assign(socketModule, factory);
  const handler = load('src/pages/api/public/[action].ts', {
    '@/server/dispatchWebhook/events': {}, 'node:crypto': require('node:crypto'), '@/lib/prisma': { prisma: db },
    '@/server/dispatch/queue': { DispatchError: class extends Error {} }, '@/server/campaigns/content': {},
    '@/utils/normalizePhoneRecipient': {}, '@/server/libs/makeWASocket': socketModule,
    '@/server/libs/qrState': { waitForQr: async () => ({ qr: 'private-fixture-qr', timeout: 60000 }) },
    '@/server/libs/pairingState': { isPairingInProgress: () => false }, '@/server/libs/pairingIdentity': identity,
    '@/server/registeredPhones': {}, '@/server/deviceWebhook/events': { updateDevice },
    '@/server/dispatchControlAuth': { resolveControlDevice: async () => phone },
    '@/server/dispatchAuth': { DispatchAuthError: class extends Error {} }, '@/server/dispatch/senderGroups': {},
    '@/lib/messagingChannel': { isTelegramDevice: p => p.channel === 'telegram' }, '@/server/telegram/dispatch': {},
  }).default;
  async function api(action, body = {}) {
    const res = { code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(data) { this.body = data; return this; } };
    await handler({ method: 'POST', query: { action }, body }, res);
    return res;
  }
  return { phone, socket, factory, connection, api, writes, events, recovery, retired, handlers,
    fence: load('src/server/messaging/sendFence.ts', { 'node:async_hooks': require('node:async_hooks'), './safety': { SendGuardError } }),
    count: () => ({ transportSends, reservations, ended }), setReserve: fn => { onReserve = fn; }, setTransport: fn => { onTransport = fn; } };
}

test('normalizes registered international numbers and rejects invalid identities', () => {
  assert.equal(identity.registeredPairingNumber('+62 (812) 3456-7890'), A);
  for (const value of [null, [], {}, '', '000000', 'abc', '62812<script>', '1'.repeat(16)]) assert.equal(identity.registeredPairingNumber(value), null);
  for (const jid of ['', '1234@s.whatsapp.net', A + '@lid', A, 'secret@s.whatsapp.net']) assert.equal(identity.actualPairingNumber({ user: { id: jid } }), null);
  assert.equal(identity.actualPairingNumber(), null);
});

test('pins registered number and does not allow rebinding or an unknown socket', () => {
  const socket = simpleSocket(A);
  assert.equal(identity.acceptsPairingIdentity(socket), false);
  identity.bindPairingIdentity(socket, A);
  assert.equal(identity.acceptsPairingIdentity(socket), true);
  identity.bindPairingIdentity(socket, B);
  assert.equal(identity.expectedPairingNumber(socket), A);
  socket.user.id = B + '@s.whatsapp.net';
  assert.equal(identity.acceptsPairingIdentity(socket), false);
  socket.user = undefined;
  assert.equal(identity.acceptsPairingIdentity(socket), false);
});

test('first pairing of a new dashboard device pins its first valid number', () => {
  for (const initial of [null, '']) {
    const socket = simpleSocket(null);
    identity.bindPairingIdentity(socket, initial);
    assert.equal(identity.acceptsPairingIdentity(socket), false);
    socket.user = { id: A + '@s.whatsapp.net' };
    assert.equal(identity.acceptsPairingIdentity(socket), true);
    assert.equal(identity.expectedPairingNumber(socket), A);
    socket.user.id = B + '@s.whatsapp.net';
    assert.equal(identity.acceptsPairingIdentity(socket), false);
  }
  const invalid = simpleSocket(A);
  identity.bindPairingIdentity(invalid, 'invalid');
  assert.equal(identity.acceptsPairingIdentity(invalid), false);
});

test('database online flag alone cannot confirm verified identity', () => {
  const phone = { id: 'fixture-offline', active: 1, isOnline: true, number: A };
  assert.equal(identity.pairingSessionIdentity(phone).online, false);
  const socket = simpleSocket(A);
  identity.bindPairingIdentity(socket, A);
  assert.equal(identity.pairingSessionIdentity(phone, socket).online, true);
  assert.equal(identity.pairingSessionIdentity({ ...phone, active: 0 }, socket).online, false);
  socket.ws.isOpen = false;
  assert.equal(identity.pairingSessionIdentity(phone, socket).online, false);
  socket.user.id = B + '@s.whatsapp.net';
  assert.equal(identity.pairingSessionIdentity(phone, socket).identity_mismatch, true);
});

test('wrong sender cannot send before connection handler or reserve quota', async () => {
  const f = fixture(); await f.factory.default('owner', 'phone');
  f.socket.user = { id: B + '@s.whatsapp.net' };
  await assert.rejects(f.socket.sendMessage(A + '@s.whatsapp.net', { text: 'fixture' }), /SENDER_NUMBER_MISMATCH/);
  assert.deepEqual(f.count(), { transportSends: 0, reservations: 0, ended: 0 });
});

test('wrong sender cannot trigger automatic replies through incoming events', async () => {
  const f = fixture(); await f.factory.default('owner', 'phone');
  f.socket.user = { id: B + '@s.whatsapp.net' };
  await f.handlers.get('messages.upsert')({ messages: [{ key: { fromMe: false } }], type: 'notify' });
  assert.equal(f.count().transportSends, 0);
  assert.equal(f.writes.length, 0);
});

test('rechecks identity after asynchronous quota checks', async () => {
  const f = fixture(); await f.factory.default('owner', 'phone');
  f.socket.user = { id: A + '@s.whatsapp.net' };
  f.setReserve(() => { f.socket.user.id = B + '@s.whatsapp.net'; });
  await assert.rejects(f.socket.sendMessage(A + '@s.whatsapp.net', { text: 'fixture' }), /SENDER_NUMBER_MISMATCH/);
  assert.equal(f.count().transportSends, 0);
});

test('correct sender still sends normally and retired socket cannot send', async () => {
  const f = fixture(); await f.factory.default('owner', 'phone');
  f.socket.user = { id: A + '@s.whatsapp.net' };
  await f.socket.sendMessage(B + '@s.whatsapp.net', { text: 'fixture' });
  assert.equal(f.count().transportSends, 1);
  f.retired.add(f.socket);
  await assert.rejects(f.socket.sendMessage(B + '@s.whatsapp.net', { text: 'fixture' }), /SENDER_NUMBER_MISMATCH/);
  assert.equal(f.count().transportSends, 1);
});

test('real socket wrapper retains its transport lock after caller timeout', async () => {
  const f = fixture(); await f.factory.default('owner', 'phone');
  f.socket.user = { id: A + '@s.whatsapp.net' };
  let release;
  f.setTransport(() => new Promise(resolve => { release = () => resolve({ key: { id: 'first' } }); }));
  const first = f.socket.sendMessage(B + '@s.whatsapp.net', { text: 'first' });
  await new Promise(resolve => setImmediate(resolve));
  await assert.rejects(Promise.race([first, Promise.reject(Error('caller timeout'))]));
  const second = f.socket.sendMessage(B + '@s.whatsapp.net', { text: 'second' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.count().transportSends, 1);
  f.setTransport(async () => ({ key: { id: 'second' } }));
  release(); await first; await second;
  assert.equal(f.count().transportSends, 2);
});

test('real socket wrapper rechecks a lost job fence after asynchronous preflight', async () => {
  const f = fixture(); await f.factory.default('owner', 'phone');
  f.socket.user = { id: A + '@s.whatsapp.net' };
  let release, current = true;
  f.setReserve(() => new Promise(resolve => { release = resolve; }));
  const send = f.fence.withSendFence({ deadlineAt: Date.now() + 60000, isCurrent: async () => current },
    () => f.socket.sendMessage(B + '@s.whatsapp.net', { text: 'late' }));
  await new Promise(resolve => setImmediate(resolve));
  current = false; release();
  await assert.rejects(send, /DEVICE_THROTTLED/);
  assert.equal(f.count().transportSends, 0);
});

test('wrong scan is retired before persistence and never changes the registered number or emits online', async () => {
  const f = fixture(); await f.factory.default('owner', 'phone');
  f.socket.user = { id: B + '@s.whatsapp.net' };
  f.recovery.attempts.set('phone', 2);
  const timer = setTimeout(() => assert.fail('Reconnect must be cancelled'), 10000);
  f.recovery.timers.set('phone', timer);
  const pending = f.connection.default(f.socket, 'owner', 'phone', { connection: 'open', isNewLogin: true });
  assert.equal(f.factory.session.has('phone'), false);
  assert.equal(f.retired.has(f.socket), true);
  assert.equal(f.count().ended, 1);
  await pending;
  assert.equal(f.phone.number, A);
  assert.equal(f.phone.active, 0);
  assert.equal(f.phone.isOnline, false);
  assert.equal(f.recovery.blocked.has('phone'), true);
  assert.equal(f.recovery.timers.has('phone'), false);
  assert.equal(f.recovery.attempts.has('phone'), false);
  assert.equal(f.events.length, 0);
  assert(f.writes.every(data => !('number' in data)));
  const status = await f.api('session');
  assert.equal(status.body.identity_mismatch, true);
  assert.equal(status.body.online, false);
  assert.equal(status.body.expected_number, A);
  await f.connection.rejectPairingIdentity(f.socket, 'owner', 'phone');
  assert.equal(f.count().ended, 1);
});

test('database failure still disconnects and blocks the wrong socket', async () => {
  const f = fixture({ dbFailure: true }); await f.factory.default('owner', 'phone');
  f.socket.user = { id: B + '@s.whatsapp.net' };
  await f.connection.default(f.socket, 'owner', 'phone', { connection: 'open' });
  assert.equal(f.factory.session.has('phone'), false);
  assert.equal(f.recovery.blocked.has('phone'), true);
  await assert.rejects(f.socket.sendMessage(A + '@s.whatsapp.net', { text: 'fixture' }), /SENDER_NUMBER_MISMATCH/);
  assert.equal(f.phone.number, A);
  assert.equal(f.count().transportSends, 0);
});

test('existing mismatched socket cannot be reused by a new QR request', async () => {
  const f = fixture(); await f.factory.default('owner', 'phone');
  f.socket.user = { id: B + '@s.whatsapp.net' };
  await assert.rejects(f.factory.default('owner', 'phone'), /SENDER_NUMBER_MISMATCH/);
  assert.equal(f.phone.active, 0);
  assert.equal(f.phone.number, A);
});

test('correct connection returns the POS identity contract, not just online', async () => {
  const f = fixture(); await f.factory.default('owner', 'phone');
  f.socket.user = { id: A + ':8@s.whatsapp.net', name: 'Fixture' };
  await f.connection.default(f.socket, 'owner', 'phone', { connection: 'open' });
  const result = await f.api('session');
  assert.equal(result.code, 200);
  assert.equal(result.body.number_verification, true);
  assert.equal(result.body.online, true);
  assert.equal(result.body.actual_number, A);
  assert.equal(result.body.expected_number, A);
  assert.equal(result.body.identity_mismatch, false);
  assert.equal(JSON.stringify(result.body).includes('private-fixture-token'), false);
});

test('QR request rejects wrong expected number, arrays, and unset device number', async () => {
  const f = fixture();
  for (const expected_number of [B, [], {}, '', null]) {
    const result = await f.api('generate-qr', { expected_number });
    assert.equal(result.code, 422);
    assert.equal(f.factory.session.size, 0);
  }
  f.phone.number = null;
  assert.equal((await f.api('generate-qr', { expected_number: A })).code, 422);
});

test('QR for the correct registered number remains available', async () => {
  const f = fixture();
  const response = await f.api('generate-qr', { expected_number: A });
  assert.equal(response.code, 200);
  assert.equal(response.body.qr, 'private-fixture-qr');
  assert.equal(identity.expectedPairingNumber(f.socket), A);
});

test('new unnumbered dashboard devices can pair without a POS expected number', async () => {
  const f = fixture({ initialNumber: null });
  assert.equal((await f.api('generate-qr')).code, 200);
  f.socket.user = { id: A + '@s.whatsapp.net', name: 'Fixture' };
  await f.connection.default(f.socket, 'owner', 'phone', { connection: 'open' });
  assert.equal(f.phone.number, A);
  assert.equal((await f.api('session')).body.actual_number, A);
});

test('Telegram session is not incorrectly advertised as verified WhatsApp', async () => {
  const f = fixture(); f.phone.channel = 'telegram'; f.phone.isOnline = true;
  const result = await f.api('session');
  assert.equal(result.body.online, true);
  assert.equal(result.body.number_verification, undefined);
});
