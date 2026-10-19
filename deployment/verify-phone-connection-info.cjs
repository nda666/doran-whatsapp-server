const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(name, mocks) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(name, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { exports, require: key => { assert.ok(key in mocks, key); return mocks[key]; }, process: { env: {} } });
  return exports;
}
async function main() {
  const { describePhoneConnection: describe } = load('src/lib/phoneConnectionStatus.ts', {});
  const base = { active: true, maintenance: false, enabled: true, online: false, pairing: false, linked: true, retrying: false };
  const cases = [
    [{ online: true }, 'online', false, 'none'],
    [{ active: false, online: true }, 'inactive', null, 'activate'],
    [{ maintenance: true, linked: false }, 'maintenance', null, 'wait'],
    [{ enabled: false, linked: false }, 'disabled', null, 'contact_admin'],
    [{ linked: false }, 'scan_qr', true, 'scan_qr'],
    [{ pairing: true, linked: false }, 'pairing', false, 'wait'],
    [{ retrying: true }, 'reconnecting', false, 'wait'],
    [{}, 'waiting', false, 'wait'],
    [{ linked: null }, 'unknown', null, 'contact_admin'],
    [{ blockedCode: 403, linked: false }, 'rejected', null, 'contact_admin'],
    [{ blockedCode: 440 }, 'conflict', false, 'contact_admin'],
    [{ blockedCode: 500 }, 'session_error', null, 'contact_admin'],
    [{ blockedCode: 411 }, 'session_error', null, 'contact_admin'],
    [{ blockedCode: 401, linked: false }, 'scan_qr', true, 'scan_qr'],
    [{ blockedCode: 401, linked: true }, 'scan_qr', true, 'scan_qr'],
  ];
  for (const [input, state, qrRequired, action] of cases) {
    const status = describe({ ...base, ...input });
    assert.equal(status.state, state); assert.equal(status.qrRequired, qrRequired); assert.equal(status.action, action);
    assert.ok(status.description.length > 30); assert.ok(Number.isFinite(Date.parse(status.checkedAt)));
  }
  const sessions = new Map(), blocked = new Set(), timers = new Map(), health = new WeakMap(), maintenance = new Set();
  let readMode = 'linked', reads = 0, pairing = false;
  const { getPhoneConnectionInfo } = load('src/server/phoneConnectionInfo.ts', {
    'node:path': require('node:path'),
    'node:fs/promises': { readFile: async () => {
      reads++;
      if (readMode === 'ENOENT' || readMode === 'EACCES') throw Object.assign(new Error(readMode), { code: readMode });
      return readMode === 'linked' ? '{"me":{"id":"private-identity"},"secret":"must-not-leak"}' : readMode;
    } },
    '../lib/phoneConnectionStatus': { describePhoneConnection: describe },
    './libs/makeWASocket': { session: sessions }, './libs/phoneMaintenance': { phoneMaintenance: maintenance },
    './libs/pairingState': { isPairingInProgress: () => pairing },
    './libs/waRecoveryState': { waRecovery: { sockets: health, blocked, timers, disconnects: new Map() } },
  });
  const phone = { id: 'phone', userId: 'owner', active: 1 };
  let info = await getPhoneConnectionInfo(phone); assert.equal(info.state, 'waiting');
  assert.equal(JSON.stringify(info).includes('private-identity'), false); assert.equal(JSON.stringify(info).includes('must-not-leak'), false);
  for (const mode of ['ENOENT', '{}']) { readMode = mode; assert.equal((await getPhoneConnectionInfo(phone)).state, 'scan_qr'); }
  for (const mode of ['EACCES', '{broken', 'null', '[]']) { readMode = mode; assert.equal((await getPhoneConnectionInfo(phone)).state, 'unknown'); }
  pairing = true; const beforePairing = reads; assert.equal((await getPhoneConnectionInfo(phone)).state, 'pairing'); assert.equal(reads, beforePairing); pairing = false;
  const socket = { ws: { isOpen: true }, authState: { creds: { me: { id: 'linked' } } } };
  sessions.set('phone', socket); health.set(socket, { connected: true, createdAt: Date.now() });
  const beforeLive = reads; assert.equal((await getPhoneConnectionInfo(phone)).state, 'online'); assert.equal(reads, beforeLive);
  socket.ws.isOpen = false; health.get(socket).connected = false;
  assert.equal((await getPhoneConnectionInfo(phone)).state, 'reconnecting');
  assert.equal((await getPhoneConnectionInfo({ ...phone, active: 0 })).state, 'inactive');
  console.log('PHONE_CONNECTION_INFO_OK: QR decisions, live connection, pairing, inactive, terminal codes, filesystem errors, credential privacy');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
