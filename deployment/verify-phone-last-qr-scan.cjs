const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(name, mocks) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(name, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  vm.runInNewContext(code, { exports, require: key => { assert(key in mocks, key); return mocks[key]; }, process: { env: {} }, Date, console: { info() {}, error() {} }, setTimeout: () => ({ unref() {} }), clearTimeout() {} });
  return exports;
}
(async () => {
  const updates = [], events = [], sessions = new Map(), maintenance = new Set(), retired = new WeakSet();
  let persisted = null, fail = false;
  const io = { to: () => io, emit: (name, data) => { if (name === 'qrScanned') assert.equal(persisted.toISOString(), data.lastQrScanAt); events.push({ name, data }); } };
  const recovery = { sockets: new WeakMap(), attempts: new Map(), timers: new Map(), blocked: new Set(), disconnects: new Map() };
  const handler = load('src/server/events/connectionUpdate.ts', {
    '../../lib/access': { SUPER_ADMIN_ROOM: 'admins' }, fs: {}, path: require('node:path'),
    '@whiskeysockets/baileys': { DisconnectReason: { loggedOut: 401, restartRequired: 515 } },
    '../../lib/prisma': { prisma: { phone: { update: async args => { if (fail) throw new Error('DB unavailable'); updates.push(args); if (args.data.lastQrScanAt) persisted = args.data.lastQrScanAt; } } } },
    '../constant': { WaSockQrTimeout: 60000 },
    '../libs/makeWASocket': { getAllSession: () => sessions, deleteSession: id => sessions.delete(id), waitForAuthSave: async () => {} },
    '../libs/socket': { getSocketIO: io }, '../libs/pairingState': { recordPairingProgress: () => undefined },
    '../deviceWebhook/events': {}, '../libs/phoneMaintenance': { phoneMaintenance: maintenance, retiredSockets: retired },
    '../libs/waRecoveryState': { waRecovery: recovery },
  }).default;
  let socket = { authState: { creds: {} } }; sessions.set('phone', socket);
  for (const update of [{ qr: 'private-qr' }, { connection: 'connecting' }]) await handler(socket, 'owner', 'phone', update);
  assert.equal(updates.length, 0, 'Generating QR must not record a scan');
  const start = Date.now();
  await handler(socket, 'owner', 'phone', { isNewLogin: true });
  assert.equal(updates.length, 1); assert.equal(updates[0].where.id, 'phone');
  assert(persisted.getTime() >= start && persisted.getTime() <= Date.now());
  assert.equal(events.filter(e => e.name === 'qrScanned').length, 1);
  const firstScan = persisted;
  // Pairing restarts the socket before reconnecting with saved credentials.
  await handler(socket, 'owner', 'phone', { connection: 'close', lastDisconnect: { error: { output: { statusCode: 515 } } } });
  socket = { authState: { creds: { me: { id: 'linked' } } } }; sessions.set('phone', socket);
  await handler(socket, 'owner', 'phone', { connection: 'open' });
  assert.equal(persisted, firstScan, 'Reconnect must preserve scan time');
  assert.equal(updates.filter(u => u.data.lastQrScanAt).length, 1);
  maintenance.add('phone'); await handler(socket, 'owner', 'phone', { isNewLogin: true }); maintenance.clear();
  retired.add(socket); await handler(socket, 'owner', 'phone', { isNewLogin: true });
  const replacement = { authState: { creds: {} } }; sessions.set('phone', replacement);
  await handler({}, 'owner', 'phone', { isNewLogin: true });
  assert.equal(updates.filter(u => u.data.lastQrScanAt).length, 1, 'Inactive sockets must be ignored');
  fail = true; await handler(replacement, 'owner', 'phone', { isNewLogin: true });
  assert.equal(events.filter(e => e.name === 'qrScanned').length, 1, 'Failed writes must not emit success');
  fail = false; await handler(replacement, 'owner', 'phone', { isNewLogin: true });
  assert.equal(updates.filter(u => u.data.lastQrScanAt).length, 2, 'A later pairing must update scan time');
  console.log('PHONE_LAST_QR_SCAN_OK: successful pairing, reconnect, QR generation, retired sockets, database failure, repeat pairing');
})().catch(error => { console.error(error); process.exitCode = 1; });
