const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { recordQrState, waitForQr } = require('../dist/src/server/libs/qrState');
function socket() {
  const s = { ev: new EventEmitter() };
  s.ev.on('connection.update', update => recordQrState(s, update, 30_000));
  return s;
}
(async () => {
  const cached = socket();
  cached.ev.emit('connection.update', { qr: 'test-cached-qr' });
  assert.equal((await waitForQr(cached)).qr, 'test-cached-qr');
  assert.equal(cached.ev.listenerCount('connection.update'), 1);
  const next = socket();
  const pending = waitForQr(next);
  next.ev.emit('connection.update', { qr: 'test-next-qr' });
  assert.equal((await pending).qr, 'test-next-qr');
  assert.equal(next.ev.listenerCount('connection.update'), 1);
  const open = socket();
  open.ev.emit('connection.update', { qr: 'test-old-qr' });
  open.ev.emit('connection.update', { connection: 'open' });
  assert.equal((await waitForQr(open)).connected, true);
  const close = socket();
  const closing = waitForQr(close);
  close.ev.emit('connection.update', { connection: 'close' });
  await assert.rejects(closing, /terputus/);
  assert.equal(close.ev.listenerCount('connection.update'), 1);
  const idle = socket();
  await assert.rejects(waitForQr(idle, 15), /belum tersedia/);
  assert.equal(idle.ev.listenerCount('connection.update'), 1);
  const expired = socket();
  recordQrState(expired, { qr: 'test-expired-qr' }, -1);
  await assert.rejects(waitForQr(expired, 15), /belum tersedia/);
  console.log('QR_CACHE_EVENT_CONNECTED_CLOSED_TIMEOUT_EXPIRY_OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
