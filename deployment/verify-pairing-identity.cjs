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
  const incomingClaims = new Set();
  const incomingEffects = { replies: 0, webhooks: 0, stops: 0, saved: 0, failClaim: false, maxAge: 0, failAge: false, ownerActive: true, failOwner: false, authClosed: 0 };
  const socket = Object.assign(simpleSocket(null), {
    ev: { on(name, callback) { handlers.set(name, callback); } },
    authState: { creds: {} },
    sendMessage: async (...args) => { transportSends++; if (onTransport) return onTransport(...args); return { key: { id: 'fixture-message' } }; },
    end() { ended++; this.ws.isOpen = false; this.ws.isClosed = true; },
  });
  class SendGuardError extends Error { constructor(code) { super(code); this.code = code; } }
  const phoneDb = {
    findMany: async ({ where }) => where.userId === phone.userId ? [phone] : [],
    findUnique: async () => phone,
    update: async ({ data }) => { writes.push(data); Object.assign(phone, data); return phone; },
    updateMany: async () => ({ count: 0 }),
  };
  const db = { phone: phoneDb, inboxMessage: { create: async () => ({}) }, waIncomingEffect: { create: async ({ data }) => {
    if (incomingEffects.failClaim) throw Error('DB_OFFLINE');
    const id = JSON.stringify(data);
    if (incomingClaims.has(id)) throw Object.assign(Error('duplicate'), { code: 'P2002' });
    incomingClaims.add(id); return data;
  } }, $transaction: async fn => {
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
    '../messaging/trafficGuard': { recordTrafficReconnect: async () => {} },
  });
  const factory = load('src/server/libs/makeWASocket.ts', {
    './waAuthState': { closeDatabaseAuth: async () => { incomingEffects.authClosed++; }, createDatabaseAuthState: async () => { await incomingEffects.onAuth?.(); return { state: {}, saveCreds: async () => {}, close: async () => { incomingEffects.authClosed++; }, assertOwned: async () => {} }; } },
    '../messaging/recipientPolicy': { ownerCanSend: async () => { if (incomingEffects.failOwner) throw Error('DB_UNAVAILABLE'); return incomingEffects.ownerActive; } },
    './waMessageStore': { groupMetadataCache: () => ({ get: async () => undefined, invalidate() {} }), getProtocolMessage: async () => undefined, storeProtocolMessage: async () => {} },
    '../messaging/transportSafety': load('src/server/messaging/transportSafety.ts', { 'node:async_hooks': require('node:async_hooks'), './safety': { SendGuardError }, '@whiskeysockets/baileys': { generateMessageIDV2: () => 'legacy-id' } }),
    '../messaging/sendFence': load('src/server/messaging/sendFence.ts', { 'node:async_hooks': require('node:async_hooks'), './safety': { SendGuardError } }),
    '../messaging/incomingDedupe': load('src/server/messaging/incomingDedupe.ts', { 'node:crypto': require('node:crypto'), '../../lib/prisma': { prisma: db } }), '../messaging/engagement': { recordReply: async () => false },
    '../messaging/autoReplyAge': { getAutoReplyMaxAgeSeconds: async () => { if (incomingEffects.failAge) throw Error('SETTING_FAILED'); return incomingEffects.maxAge; } },
    '../../lib/autoReplyAge': load('src/lib/autoReplyAge.ts'),
    '../messaging/trafficGuard': { trafficContentHash: () => 'hash' }, '../dispatch/settings': { getTrafficPolicy: async () => ({ enabled: false }) },
    '../messaging/restrictions': { recordRestriction: async () => {}, refreshRestrictions: async () => {}, requireUnrestricted: async () => {} },
    'pino-pretty': {}, pino: () => ({}),
    '../messaging/safety': { SendGuardError, captureStop: async () => { incomingEffects.stops++; return true; }, usageDay: () => '2026-11-01', reserveSend: async () => { reservations++; await onReserve?.(); return 'day'; }, recipientBlocked: async () => false },
    '@whiskeysockets/baileys': { __esModule: true, default: async () => socket, useMultiFileAuthState: async () => ({ state: {}, saveCreds: async () => {} }) },
    '../../lib/prisma': { prisma: db }, '../../server/utils/getWaMessage': { getWaMesage: messages => ({ messageIn: messages[0].message?.conversation || messages[0].message?.extendedTextMessage?.text || '', quotedMessage: messages[0].message?.extendedTextMessage?.contextInfo?.quotedMessage }) }, '../../services/phone': { getPhoneById: async () => phone },
    '../constant': { WaSockQrTimeout: 60000 }, '../events/connectionUpdate': connection, './pairingIdentity': identity,
    '../events/handleMessageInEvent': { handleMessageInEvent: async props => { if (props.allowAutoReply !== false) incomingEffects.replies++; } }, '../events/handleQuotedMessageEvent': { handleQuotedMessageEvent: async props => { if (props.allowAutoReply !== false) incomingEffects.replies++; } },
    '../utils/safeLinkPreview': {}, './qrState': { recordQrState() {} }, '../dispatch/receipts': {},
    '../campaigns/contacts': {}, '../utils/sendDeviceWebhook': { sendDeviceWebhook: async () => { incomingEffects.webhooks++; } }, '../deviceWebhook/events': { updateDevice },
    './phoneMaintenance': { phoneMaintenance: maintenance, retiredSockets: retired }, './waRecoveryState': { waRecovery: recovery },
    '../chat/store': { captureChatMessage: async () => { incomingEffects.saved++; incomingEffects.onCapture?.(); } },
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
  return { phone, socket, factory, connection, api, writes, events, recovery, retired, handlers, incomingEffects,
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

test('append cannot consume a live claim; notify redelivery produces effects once and DB failures send nothing', async () => {
  const f = fixture(); await f.factory.default('owner', 'phone');
  f.socket.user = { id: A + '@s.whatsapp.net' };
  f.phone.webhookUrl = 'https://example.invalid/hook';
  const incoming = { key: { id: 'inbound-1', remoteJid: B + '@s.whatsapp.net', fromMe: false }, message: { conversation: 'Halo' } };
  const handle = f.handlers.get('messages.upsert');
  await handle({ messages: [incoming], type: 'append' });
  assert.equal(f.incomingEffects.replies, 0); assert.equal(f.incomingEffects.webhooks, 0);
  await handle({ messages: [incoming], type: 'notify' });
  await handle({ messages: [incoming], type: 'notify' });
  assert.equal(f.incomingEffects.replies, 1); assert.equal(f.incomingEffects.webhooks, 1);
  f.incomingEffects.failClaim = true;
  const next = { ...incoming, key: { ...incoming.key, id: 'inbound-2' } };
  await handle({ messages: [next], type: 'notify' });
  assert.equal(f.incomingEffects.replies, 1); assert.equal(f.incomingEffects.webhooks, 1);
  f.incomingEffects.failClaim = false;
  await handle({ messages: [next], type: 'notify' });
  assert.equal(f.incomingEffects.replies, 2); assert.equal(f.incomingEffects.webhooks, 2);
  const stop = { ...incoming, key: { ...incoming.key, id: 'stop-history' }, message: { conversation: 'STOP' } };
  await handle({ messages: [stop], type: 'append' });
  assert.equal(f.incomingEffects.stops, 0, 'History cannot revoke a later recipient re-consent');
  await handle({ messages: [stop], type: 'notify' });
  assert.equal(f.incomingEffects.stops, 1); assert.equal(f.incomingEffects.replies, 2);
});

test('rechecks identity after asynchronous quota checks', async () => {
  const f = fixture(); await f.factory.default('owner', 'phone');
  f.socket.user = { id: A + '@s.whatsapp.net' };
  f.setReserve(() => { f.socket.user.id = B + '@s.whatsapp.net'; });
  await assert.rejects(f.socket.sendMessage(A + '@s.whatsapp.net', { text: 'fixture' }), /SENDER_NUMBER_MISMATCH/);
  assert.equal(f.count().transportSends, 0);
});

test('inactive owner cannot create a socket, including deactivation during auth acquisition', async () => {
  let f = fixture(); f.incomingEffects.ownerActive = false;
  await assert.rejects(f.factory.default('owner', 'phone'), e => e.code === 'ACCOUNT_INACTIVE');
  assert.equal(f.handlers.size, 0);
  f = fixture(); f.incomingEffects.onAuth = () => { f.incomingEffects.ownerActive = false; };
  await assert.rejects(f.factory.default('owner', 'phone'), e => e.code === 'ACCOUNT_INACTIVE');
  assert.equal(f.incomingEffects.authClosed, 1); assert.equal(f.handlers.size, 0);
});

test('owner suspension clears reconnects and retires sockets while retaining auth; assignee suspension is isolated', async () => {
  const f = fixture(); await f.factory.default('owner', 'phone');
  f.phone.assignedUserId = 'assignee';
  await f.factory.suspendOwnedWaSessions('assignee');
  assert.equal(f.count().ended, 0);
  const timer = setTimeout(() => { throw Error('Retired owner must not reconnect'); }, 60_000); timer.unref();
  f.recovery.timers.set('phone', timer);
  f.incomingEffects.ownerActive = false;
  await f.factory.suspendOwnedWaSessions('owner');
  assert.equal(f.count().ended, 1); assert.equal(f.retired.has(f.socket), true);
  assert.equal(f.factory.getAllSession().has('phone'), false); assert.equal(f.recovery.timers.has('phone'), false);
  assert.equal(f.recovery.blocked.has('phone'), false, 'Reactivation is not permanently blocked');
  assert.equal(f.incomingEffects.authClosed, 1, 'Auth lease is released without logout/credential deletion');
});

test('inactive/unknown owner cannot process inbound, and deactivation during media blocks external effects', async () => {
  const incoming = { key: { id: 'owner-check', remoteJid: B + '@s.whatsapp.net' }, message: { conversation: 'Halo' } };
  for (const mode of ['inactive', 'unknown', 'during-storage']) {
    const f = fixture(); await f.factory.default('owner', 'phone');
    f.socket.user = { id: A + '@s.whatsapp.net' }; f.phone.webhookUrl = 'https://example.invalid/hook';
    if (mode === 'inactive') f.incomingEffects.ownerActive = false;
    if (mode === 'unknown') f.incomingEffects.failOwner = true;
    if (mode === 'during-storage') f.incomingEffects.onCapture = () => { f.incomingEffects.ownerActive = false; };
    await f.handlers.get('messages.upsert')({ messages: [incoming], type: 'notify' });
    assert.equal(f.incomingEffects.replies, 0); assert.equal(f.incomingEffects.webhooks, 0);
    assert.equal(f.incomingEffects.saved, mode === 'during-storage' ? 1 : 0);
  }
});

test('age limits only automated replies; history, webhook, STOP and event-arrival timing remain independent', async () => {
  const f = fixture(); await f.factory.default('owner', 'phone');
  f.socket.user = { id: A + '@s.whatsapp.net' }; f.phone.webhookUrl = 'https://example.invalid/hook';
  f.incomingEffects.maxAge = 120;
  const handle = f.handlers.get('messages.upsert');
  const originalNow = Date.now;
  let now = 1_790_000_000_000;
  Date.now = () => now;
  const incoming = (id, age, text = 'Halo') => ({ key: { id, remoteJid: B + '@s.whatsapp.net' }, messageTimestamp: now / 1000 - age, message: { conversation: text } });
  try {
    const old = incoming('old', 121);
    await handle({ messages: [old], type: 'notify' });
    assert.equal(f.incomingEffects.replies, 0); assert.equal(f.incomingEffects.webhooks, 1); assert.equal(f.incomingEffects.saved, 1);
    await handle({ messages: [incoming('boundary', 120)], type: 'notify' });
    assert.equal(f.incomingEffects.replies, 1);
    f.incomingEffects.onCapture = () => { now += 300_000; };
    await handle({ messages: [incoming('slow-media', 0)], type: 'notify' });
    assert.equal(f.incomingEffects.replies, 2, 'Media processing time must not age a fresh event');
    f.incomingEffects.onCapture = undefined;
    await handle({ messages: [incoming('old-stop', 3600, 'STOP')], type: 'notify' });
    assert.equal(f.incomingEffects.stops, 1); assert.equal(f.incomingEffects.replies, 2);
    f.incomingEffects.failAge = true;
    await handle({ messages: [incoming('config-failure', 0)], type: 'notify' });
    assert.equal(f.incomingEffects.replies, 2); assert.equal(f.incomingEffects.webhooks, 5); assert.equal(f.incomingEffects.saved, 5);
    f.incomingEffects.failAge = false; f.incomingEffects.maxAge = 0;
    await handle({ messages: [old], type: 'notify' });
    assert.equal(f.incomingEffects.replies, 2, 'Changing age settings cannot replay an already claimed event');
    await handle({ messages: [incoming('disabled-limit', 3600)], type: 'notify' });
    assert.equal(f.incomingEffects.replies, 3);
    f.incomingEffects.maxAge = 120;
    const quote = incoming('old-quote', 3600);
    quote.message = { extendedTextMessage: { text: 'Jawab', contextInfo: { quotedMessage: { conversation: 'menu' } } } };
    await handle({ messages: [quote], type: 'notify' });
    assert.equal(f.incomingEffects.replies, 3, 'Quoted replies follow the same age policy');
  } finally { Date.now = originalNow; }
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
