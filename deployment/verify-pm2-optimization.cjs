const assert = require('node:assert/strict');
const { createGracefulShutdown } = require('../dist/src/server/gracefulShutdown');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
  const order = [], exits = [], events = [];
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const stop = createGracefulShutdown({
    stopIntake: () => order.push('intake'),
    drain: [async () => { order.push('worker-a'); await pending; order.push('drained'); }, async () => { order.push('worker-b'); }],
    close: [async () => order.push('sockets'), async () => order.push('database')],
    exit: code => exits.push(code), log: event => events.push(event),
  });
  const first = stop('SIGINT');
  assert.equal(stop('SIGTERM'), first);
  await sleep(0);
  assert.deepEqual(order, ['intake', 'worker-a', 'worker-b']);
  release(); await first;
  assert.deepEqual(order, ['intake', 'worker-a', 'worker-b', 'drained', 'sockets', 'database']);
  assert.deepEqual(exits, [0]);
  assert.equal(events.filter(e => e === 'SERVER_SHUTDOWN_STARTED').length, 1);
  const failures = [], cleanup = [];
  await createGracefulShutdown({ stopIntake: () => {}, drain: [async () => { throw Error('test'); }],
    close: [async () => { cleanup.push('socket'); throw Error('test'); }, async () => cleanup.push('db')],
    exit: code => failures.push(code), log: () => {} })('SIGTERM');
  assert.deepEqual(cleanup, ['socket', 'db']); assert.deepEqual(failures, [1]);
  const timeouts = [];
  let unblock;
  const hung = createGracefulShutdown({ stopIntake: () => {}, drain: [() => new Promise(resolve => { unblock = resolve; })], close: [async () => { throw Error('must not run'); }], timeoutMs: 20, exit: code => timeouts.push(code), log: () => {} });
  const hanging = hung('SIGTERM'); await sleep(50); assert.deepEqual(timeouts, [1]); unblock(); await hanging; assert.deepEqual(timeouts, [1]);
  process.env.WHATSAPP_ENABLED = 'false'; process.env.QUEUE_ENABLED = 'false'; process.env.DORAN_SHUTTING_DOWN = 'true';
  const sockets = require('../dist/src/server/libs/makeWASocket');
  await assert.rejects(sockets.default('test', 'test'), /sedang berhenti/);
  let persisted = false, ended = 0;
  const socket = { end: () => { assert(persisted); ended++; } };
  global.doranAuthWrites.set(socket, sleep(10).then(() => { persisted = true; }));
  sockets.session.set('test', socket);
  await sockets.closeWaSessions(); assert.equal(ended, 1); assert.equal(sockets.session.size, 0);
  const updates = require('../dist/src/server/events/connectionUpdate');
  await updates.default({}, 'test', 'test', { connection: 'close' });
  updates.stopReconnectTimers();
  delete process.env.DORAN_SHUTTING_DOWN;
  await require('../dist/src/lib/prisma').prisma.$disconnect();
  require('../dist/src/server/libs/socket').getSocketIO.disconnectSockets(true);
  console.log('SHUTDOWN_ORDER_DUPLICATE_SIGNAL_FAILURE_TIMEOUT_AUTH_SAVE_AND_RECONNECT_GUARD_PASSED');
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
