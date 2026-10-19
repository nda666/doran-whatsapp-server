const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

async function main() {
  process.env.WHATSAPP_ENABLED = 'false';
  process.env.QUEUE_ENABLED = 'false';
  const baileys = require('@whiskeysockets/baileys');
  const encoded = baileys.proto.Message.encode({ conversation: 'offline compatibility test' }).finish();
  assert.equal(baileys.proto.Message.decode(encoded).conversation, 'offline compatibility test');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'doran-baileys-check-'));
  try {
    const { state, saveCreds } = await baileys.useMultiFileAuthState(temp);
    assert.equal(state.creds.registered, false);
    await saveCreds();
    const restored = await baileys.useMultiFileAuthState(temp);
    assert.deepEqual(restored.state.creds.noiseKey.public, state.creds.noiseKey.public);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
  console.log('BAILEYS_PROTO_AND_AUTH_OK');

  const sockets = require('../dist/src/server/libs/makeWASocket');
  await assert.rejects(sockets.default('test-user', 'test-phone'), /dinonaktifkan/);
  assert.equal(sockets.session.size, 0);
  console.log('OFFLINE_GUARD_OK');

  const onUpdate = require('../dist/src/server/events/connectionUpdate').default;
  const { prisma } = require('../dist/src/lib/prisma');
  const originalUpdate = prisma.phone.update;
  const originalSocket = sockets.default;
  const originalTimeout = global.setTimeout;
  const originalClear = global.clearTimeout;
  const originalRemove = fs.rmSync;
  const timers = [];
  let reconnects = 0;
  let deletedPath;
  prisma.phone.update = async () => ({});
  sockets.default = async () => { reconnects++; return {}; };
  global.setTimeout = (callback, delay) => {
    const timer = { callback, delay, cancelled: false, unref() {} };
    timers.push(timer);
    return timer;
  };
  global.clearTimeout = timer => { timer.cancelled = true; };
  fs.rmSync = target => { deletedPath = target; };
  const close = code => ({ connection: 'close', lastDisconnect: { error: { output: { statusCode: code } } } });
  // Only paired devices reconnect; each closed socket is retired by the runtime.
  const pairedSocket = () => ({ authState: { creds: { me: { id: 'fixture@s.whatsapp.net' } } } });
  try {
    process.env.WHATSAPP_ENABLED = 'true';
    await onUpdate(pairedSocket(), 'test-user', 'test-phone', close(baileys.DisconnectReason.timedOut));
    assert.equal(timers[0].delay, 2000);
    await onUpdate(pairedSocket(), 'test-user', 'test-phone', close(baileys.DisconnectReason.timedOut));
    assert.equal(timers[0].cancelled, true);
    assert.equal(timers[1].delay, 4000);
    await onUpdate(pairedSocket(), 'test-user', 'test-phone', { connection: 'open' });
    assert.equal(timers[1].cancelled, true);
    const count = timers.length;
    await onUpdate(pairedSocket(), 'test-user', 'test-phone', close(baileys.DisconnectReason.loggedOut));
    assert.equal(timers.length, count);
    assert.ok(deletedPath.endsWith('test-user-test-phone'));
    await onUpdate(pairedSocket(), 'test-user', 'test-phone', close(baileys.DisconnectReason.connectionReplaced));
    assert.equal(timers.length, count);
    process.env.WHATSAPP_ENABLED = 'false';
    await onUpdate(pairedSocket(), 'test-user', 'test-phone', close(baileys.DisconnectReason.timedOut));
    assert.equal(timers.length, count);
    assert.equal(reconnects, 0);
    console.log('RECONNECT_BACKOFF_AND_TERMINAL_STATES_OK');
  } finally {
    prisma.phone.update = originalUpdate;
    sockets.default = originalSocket;
    global.setTimeout = originalTimeout;
    global.clearTimeout = originalClear;
    fs.rmSync = originalRemove;
    process.env.WHATSAPP_ENABLED = 'false';
    await prisma.$disconnect();
  }
  const originalFetch = global.fetch;
  global.fetch = async () => {
    const response = new Response('<html><head><title>Offline preview fixture</title></head><body>Fixture</body></html>', { headers: { 'content-type': 'text/html' } });
    Object.defineProperty(response, 'url', { value: 'https://example.com' });
    return response;
  };
  try {
    const previewOptions = { thumbnailWidth: 192, fetchOpts: { timeout: 1000, resolveDNSHost: async () => '93.184.216.34' } };
    const preview = await baileys.getUrlInfo('https://example.com', previewOptions);
    assert.equal(preview?.title, 'Offline preview fixture');
  } finally { global.fetch = originalFetch; }
  console.log('BAILEYS_LINK_PREVIEW_COMPATIBILITY_OK');
}

main().then(() => process.exit(0)).catch(error => {
  console.error(error.message);
  process.exit(1);
});
