const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

async function main() {
  const source = fs.readFileSync(path.join(__dirname, '../src/server/events/connectionUpdate.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const sessions = new Map();
  const maintenance = new Set(), retired = new WeakSet();
  const recovery = { attempts: new Map(), timers: new Map(), blocked: new Set(), sockets: new WeakMap() };
  const writes = [], events = [], timers = [];
  let online = false, status = 'CLOSE';
  const io = { to() { return this; }, emit(name, data) {
    if (name === 'isOnline') {
      assert.equal(online, data.isOnline, 'persist before notification');
      assert.equal(status, data.isOnline ? 'OPEN' : 'CLOSE', 'status must agree before notification');
    }
    events.push({ name, data });
  } };
  const socketModule = { getAllSession: () => sessions, deleteSession: id => sessions.delete(id), waitForAuthSave: async () => {}, default: async () => {} };
  const mocks = {
    '../../lib/access': { SUPER_ADMIN_ROOM: 'admin' },
    fs: { rmSync() { throw new Error('Unexpected credential deletion'); } }, path: require('node:path'),
    '@whiskeysockets/baileys': { DisconnectReason: { loggedOut: 401, restartRequired: 515, connectionReplaced: 440, badSession: 500, forbidden: 403, multideviceMismatch: 411 } },
    '../../lib/prisma': { prisma: { $transaction(fn) { return fn({ phone: { ...this.phone, updateMany: async () => ({ count: 0 }) } }); }, phone: { update: async value => { writes.push(value); online = value.data.isOnline; status = value.data.status; } } } },
    '../constant': { WaSockQrTimeout: 60000 }, '../libs/makeWASocket': socketModule,
    '../libs/socket': { getSocketIO: io }, '../libs/pairingState': { recordPairingProgress: () => undefined },
    '../deviceWebhook/events': { updateDevice: async () => {} },
    '../libs/phoneMaintenance': { phoneMaintenance: maintenance, retiredSockets: retired },
    '../libs/waRecoveryState': { waRecovery: recovery },
  };
  const exports = {};
  vm.runInNewContext(code, { exports, require: name => { assert.ok(name in mocks, name); return mocks[name]; },
    process: { env: { WHATSAPP_ENABLED: 'true' } }, console: { info() {} },
    setTimeout: (callback, delay) => { const timer = { callback, delay, unref() {} }; timers.push(timer); return timer; }, clearTimeout() {},
  });
  const socket = { user: { id: '628123@s.whatsapp.net', name: 'Test' } };
  sessions.set('phone', socket);
  const update = data => exports.default(socket, 'user', 'phone', data);
  await update({ connection: 'open', isOnline: false });
  assert.equal(online, true, 'connected with hidden presence remains online');
  assert.equal(events.filter(event => event.name === 'isOnline').length, 1);
  const count = writes.length;
  await update({ isOnline: false });
  await update({ isOnline: true });
  assert.equal(writes.length, count, 'presence-only updates do not change connectivity');
  await update({ connection: 'close', lastDisconnect: { error: { output: { statusCode: 515 } } } });
  assert.equal(online, false);
  assert.equal(timers[0].delay, 500, 'QR restart still reconnects');
  const replacement = {};
  sessions.set('phone', replacement);
  await exports.default(replacement, 'user', 'phone', { connection: 'open' });
  assert.equal(online, true, 'reconnection restores online without presence event');
  await update({ connection: 'close' });
  assert.equal(online, true, 'old socket cannot disconnect replacement');
  assert.equal(sessions.get('phone'), replacement);
  const beforeCleanupWrites = writes.length;
  sessions.delete('phone'); retired.add(socket);
  await update({ connection: 'close' });
  assert.equal(writes.length, beforeCleanupWrites, 'retired socket must not update deleted/reset device');
  maintenance.add('phone');
  await exports.default(replacement, 'user', 'phone', { connection: 'open' });
  assert.equal(writes.length, beforeCleanupWrites, 'cleanup blocks concurrent connection updates');
  console.log('CONNECTION_STATUS_OK: open, hidden presence, close, QR restart, reconnect, stale socket');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
