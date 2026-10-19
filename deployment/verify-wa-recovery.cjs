const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks, extra = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { exports, require: key => { assert.ok(key in mocks, key); return mocks[key]; }, process: { env: {} }, console: { info() {}, error() {} }, ...extra });
  return exports;
}
async function main() {
  const state = { attempts: new Map(), timers: new Map(), blocked: new Set(), sockets: new WeakMap() };
  const sessions = new Map(), maintenance = new Set(), retired = new WeakSet();
  const attempts = [], reads = [], saves = [], ended = [];
  let phones = [], queryFails = false, failDevice;
  const env = {};
  const socket = (id, { linked = true, closed = false, connected = false, age = 0 } = {}) => {
    const sock = { authState: { creds: linked ? { me: { id: 'linked' } } : {} }, ws: { isClosed: closed, isClosing: false }, end() { ended.push(id); } };
    state.sockets.set(sock, { createdAt: Date.now() - age, connected });
    sessions.set(id, sock); return sock;
  };
  const add = id => phones.push({ id, userId: 'owner' });
  const recovery = load('src/server/waRecovery.ts', {
    'node:path': require('node:path'),
    'node:fs/promises': { readFile: async name => { reads.push(name); if (name.includes('unlinked')) return '{}'; return '{"me":{"id":"linked"}}'; } },
    '../lib/prisma': { prisma: { phone: { findMany: async () => { if (queryFails) throw new Error('DB'); return phones; } } } },
    './libs/makeWASocket': { session: sessions, waitForPendingSocket: async () => {}, waitForAuthSave: async s => saves.push(s), default: async (_, id) => { attempts.push(id); if (id === failDevice) throw new Error('CREATE_FAILED'); socket(id); } },
    './libs/phoneMaintenance': { phoneMaintenance: maintenance, retiredSockets: retired },
    './libs/waRecoveryState': { waRecovery: state },
  }, { process: { env } });
  assert.equal(recovery.WA_RECOVERY_INTERVAL_MS, 30000);
  for (const id of ['healthy', 'connecting', 'stuck', 'closed', 'missing', 'unlinked', 'qr', 'blocked', 'timer', 'cleanup', 'fails', 'after-fail']) add(id);
  socket('healthy', { connected: true, age: 900000 });
  socket('connecting', { age: 90000 });
  const stuck = socket('stuck', { age: 121000 });
  socket('closed', { closed: true }); socket('qr', { linked: false, age: 900000 });
  state.blocked.add('blocked'); state.timers.set('timer', {}); maintenance.add('cleanup'); failDevice = 'fails';
  await Promise.all([recovery.recoverWaConnections(), recovery.recoverWaConnections()]);
  assert.deepEqual(attempts, ['stuck', 'closed', 'missing', 'fails', 'after-fail']);
  assert.deepEqual(ended, ['stuck', 'closed']); assert.equal(retired.has(stuck), true); assert.equal(saves.length, 2);
  attempts.length = 0;
  env.DORAN_SHUTTING_DOWN = 'true'; await recovery.recoverWaConnections(); assert.equal(attempts.length, 0);
  delete env.DORAN_SHUTTING_DOWN; env.WHATSAPP_ENABLED = 'false'; await recovery.recoverWaConnections(); assert.equal(attempts.length, 0);
  delete env.WHATSAPP_ENABLED; queryFails = true; await assert.rejects(recovery.recoverWaConnections(), /DB/);
  queryFails = false; phones = [{ id: 'after-db', userId: 'owner' }]; await recovery.recoverWaConnections(); assert.deepEqual(attempts, ['after-db']);

  // Retry transport even when persisting offline status temporarily fails.
  const timers = [], connected = { authState: { creds: { me: { id: 'linked' } } } };
  sessions.set('db-failure', connected);
  let dbDown = true;
  const connection = load('src/server/events/connectionUpdate.ts', {
    '../../lib/access': { SUPER_ADMIN_ROOM: 'admin' }, fs: { rmSync() { throw new Error('Credential deletion'); } }, path: require('node:path'),
    '@whiskeysockets/baileys': { DisconnectReason: { loggedOut: 401, restartRequired: 515, connectionReplaced: 440, badSession: 500, forbidden: 403, multideviceMismatch: 411 } },
    '../../lib/prisma': { prisma: { phone: { update: async () => { if (dbDown) throw new Error('DB_DOWN'); } } } },
    '../constant': { WaSockQrTimeout: 60000 }, '../libs/makeWASocket': { getAllSession: () => sessions, deleteSession: id => sessions.delete(id), waitForAuthSave: async () => {}, default: async (_, id) => attempts.push(id) },
    '../libs/socket': { getSocketIO: undefined }, '../libs/pairingState': { recordPairingProgress: () => undefined },
    '../deviceWebhook/events': {}, '../libs/phoneMaintenance': { phoneMaintenance: maintenance, retiredSockets: retired }, '../libs/waRecoveryState': { waRecovery: state },
  }, { setTimeout: (callback, delay) => { const timer = { callback, delay, unref() {} }; timers.push(timer); return timer; }, clearTimeout() {} });
  const close = code => ({ connection: 'close', lastDisconnect: { error: { output: { statusCode: code } } } });
  await connection.default(connected, 'owner', 'db-failure', close(408));
  assert.equal(timers[0].delay, 2000); assert.equal(sessions.has('db-failure'), false);
  timers[0].callback(); await new Promise(resolve => setImmediate(resolve)); assert.equal(attempts.at(-1), 'db-failure');
  dbDown = false;
  const qr = { authState: { creds: {} } }; sessions.set('qr-expired', qr);
  await connection.default(qr, 'owner', 'qr-expired', close(408)); assert.equal(timers.length, 1);
  const terminal = { authState: { creds: { me: { id: 'linked' } } } }; sessions.set('terminal', terminal);
  await connection.default(terminal, 'owner', 'terminal', close(440)); assert.equal(state.blocked.has('terminal'), true); assert.equal(timers.length, 1);

  // A manual retry must replace a closed cached socket and coalesce callers.
  let created = 0, authSaves = 0;
  const handlers = new Map();
  const newSocket = () => ({ ws: { isOpen: false, isClosed: false, isClosing: false },
    authState: { creds: { me: { id: 'linked' } } },
    sendMessage() {}, end() {}, ev: { on(name, callback) { handlers.set(name, callback); } } });
  const factoryMocks = new Proxy({
    '../chat/store': { captureChatMessage: async () => {}, recordChatReceipt: async () => {} },
    pino: { default: () => ({}) },
    '@whiskeysockets/baileys': { default: () => { created++; return newSocket(); }, useMultiFileAuthState: async () => ({ state: {}, saveCreds: async () => { authSaves++; } }) },
    '../../services/phone': { getPhoneById: async () => ({ userId: 'owner', active: 1 }) },
    './phoneMaintenance': { phoneMaintenance: maintenance, retiredSockets: retired },
    './waRecoveryState': { waRecovery: state },
  }, { has: () => true, get: (obj, key) => obj[key] || {} });
  const factory = load('src/server/libs/makeWASocket.ts', factoryMocks, { globalThis: {} });
  const first = await factory.default('owner', 'factory');
  assert.equal(factory.session.get('factory'), first);
  assert.equal(await factory.default('owner', 'factory'), first); assert.equal(created, 1);
  handlers.get('creds.update')({}); await factory.waitForAuthSave(first); assert.equal(authSaves, 1);
  first.ws.isClosed = true;
  const [second, coalesced] = await Promise.all([factory.default('owner', 'factory'), factory.default('owner', 'factory')]);
  assert.notEqual(second, first); assert.equal(second, coalesced); assert.equal(created, 2); assert.equal(retired.has(first), true);
  console.log('WA_RECOVERY_OK: 30s watchdog, closed/stuck sockets, backoff coordination, QR/terminal/cleanup/shutdown exclusions, single sweep, DB failure, per-device isolation');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
