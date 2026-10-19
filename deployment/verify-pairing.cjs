const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { pairingPhase, recordPairingProgress, isPairingInProgress } = require('../dist/src/server/libs/pairingState');
const { recordQrState, waitForQr } = require('../dist/src/server/libs/qrState');
const closed = code => ({ connection: 'close', lastDisconnect: { error: { output: { statusCode: code } } } });
function socket() {
  const s = { ev: new EventEmitter() };
  s.ev.on('connection.update', update => recordQrState(s, update, 30_000));
  return s;
}
(async () => {
  assert.equal(pairingPhase({ isNewLogin: true }, 'qr'), 'pairing');
  assert.equal(pairingPhase(closed(515), 'qr'), 'pairing');
  assert.equal(pairingPhase(closed(408), 'pairing'), 'pairing');
  assert.equal(pairingPhase(closed(408), 'qr'), 'error');
  for (const code of [401, 403, 411, 440, 500]) assert.equal(pairingPhase(closed(code), 'pairing'), 'error');
  assert.equal(pairingPhase({ connection: 'open' }, 'pairing'), 'connected');
  recordPairingProgress('test-pairing-device', { isNewLogin: true });
  assert.equal(isPairingInProgress('test-pairing-device'), true);
  recordPairingProgress('test-pairing-device', { connection: 'open' });
  assert.equal(isPairingInProgress('test-pairing-device'), false);
  const scanned = socket();
  scanned.ev.emit('connection.update', { qr: 'fake-qr' });
  scanned.ev.emit('connection.update', { isNewLogin: true });
  assert.deepEqual(await waitForQr(scanned), { pairing: true, timeout: 0 });
  scanned.ev.emit('connection.update', closed(515));
  assert.deepEqual(await waitForQr(scanned), { pairing: true, timeout: 0 });
  assert.equal(scanned.ev.listenerCount('connection.update'), 1);
  scanned.ev.emit('connection.update', closed(401));
  await assert.rejects(waitForQr(scanned), /terputus/);
  console.log('PAIRING_RESTART_TRANSIENT_TERMINAL_AND_QR_STATE_OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
