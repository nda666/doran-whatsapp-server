const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, require: key => { assert(key in mocks, key); return mocks[key]; }, process: { env: {} }, Date, console: { info() {}, error() {} }, setTimeout: () => ({ unref() {} }), clearTimeout() {} });
  return exports;
}
(async () => {
  let phone = { id: 'phone', isOnline: false, status: 'CLOSE', lastOfflineAt: null }, fail = false;
  const sessions = new Map(), maintenance = new Set(), retired = new WeakSet(), events = [];
  const recovery = { sockets: new WeakMap(), attempts: new Map(), timers: new Map(), blocked: new Set(), disconnects: new Map() };
  const tx = { phone: {
    update: async ({ data }) => { Object.assign(phone, data); return phone; },
    updateMany: async ({ where, data }) => { if (phone.id !== where.id || phone.isOnline !== where.isOnline) return { count: 0 }; Object.assign(phone, data); return { count: 1 }; },
  } };
  const io = { to: () => io, emit: (name, data) => {
    if (name === 'isOnline') { assert.equal(phone.isOnline, data.isOnline); if (!data.isOnline && phone.lastOfflineAt) assert(phone.lastOfflineAt instanceof Date); }
    events.push({ name, data });
  } };
  const handler = load('src/server/events/connectionUpdate.ts', {
    '../../lib/access': { SUPER_ADMIN_ROOM: 'admins' }, fs: { rmSync() {} }, path: require('node:path'),
    '@whiskeysockets/baileys': { DisconnectReason: { loggedOut: 401, restartRequired: 515 } },
    '../../lib/prisma': { prisma: { ...tx, $transaction: async fn => { if (fail) throw new Error('DB_DOWN'); return fn(tx); } } },
    '../constant': { WaSockQrTimeout: 60000 },
    '../libs/makeWASocket': { getAllSession: () => sessions, deleteSession: id => sessions.delete(id), waitForAuthSave: async () => {} },
    '../libs/socket': { emitDeviceEvent: async (_phoneId, event, data) => io.emit(event, data) }, '../libs/pairingState': { recordPairingProgress: () => undefined },
    '../deviceWebhook/events': {}, '../libs/phoneMaintenance': { phoneMaintenance: maintenance, retiredSockets: retired },
    '../libs/waRecoveryState': { waRecovery: recovery },
    '../libs/pairingIdentity': { acceptsPairingIdentity: () => true, rejectedPairings: new Set() },
  }).default;
  const socket = () => { const s = { authState: { creds: { me: { id: 'linked' } } } }; sessions.set('phone', s); return s; };
  const close = s => handler(s, 'owner', 'phone', { connection: 'close', lastDisconnect: { error: { output: { statusCode: 515 } } } });
  await close(socket()); assert.equal(phone.lastOfflineAt, null, 'Unconnected devices have no invented history');
  let s = socket(); await handler(s, 'owner', 'phone', { connection: 'open' });
  const start = Date.now(); await close(s);
  const first = phone.lastOfflineAt;
  assert(first instanceof Date); assert(first.getTime() >= start && first.getTime() <= Date.now());
  await close(socket()); assert.equal(phone.lastOfflineAt, first, 'Failed reconnect preserves start of offline period');
  s = socket(); await handler(s, 'owner', 'phone', { connection: 'open' });
  assert.equal(phone.lastOfflineAt, first, 'Going online preserves last offline time');
  await handler(s, 'owner', 'phone', { isOnline: false }); assert.equal(phone.isOnline, true, 'Presence is not connectivity');
  await close(s); assert.notEqual(phone.lastOfflineAt, first, 'Next outage records a new timestamp');
  const second = phone.lastOfflineAt;
  s = socket(); maintenance.add('phone'); await close(s); maintenance.clear();
  retired.add(s); await close(s); await close({});
  assert.equal(phone.lastOfflineAt, second, 'Maintenance and stale sockets cannot overwrite history');
  s = socket(); await handler(s, 'owner', 'phone', { connection: 'open' });
  const count = events.filter(e => e.name === 'isOnline').length;
  fail = true; await close(s);
  assert.equal(phone.lastOfflineAt, second); assert.equal(events.filter(e => e.name === 'isOnline').length, count);
  assert(recovery.timers.has('phone'), 'Database failure must not prevent reconnect');
  console.log('PHONE_LAST_OFFLINE_OK: first outage, repeated retry, recovery, next outage, presence, stale sockets, maintenance, DB failure');
})().catch(error => { console.error(error); process.exitCode = 1; });
