'use strict';
// Offline regression: no WhatsApp, production DB, credentials, or output files.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, deps, shared = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, { exports, globalThis: shared, require: id => {
    if (id in deps) return deps[id];
    if (id.startsWith('node:')) return require(id);
    throw Error('Unexpected dependency: ' + id);
  }, console: { error() {} }, Date, Buffer, process: { env: {} },
  setInterval: () => ({ unref() {} }), clearInterval() {} });
  return exports;
}
async function authRegression() {
  let row, releaseFails = false, writeFails = false, acquisitions = 0, lost = 0;
  const db = { waAuthSession: {
    createMany: async () => { row ||= { migratedAt: new Date(), leaseToken: null, leaseUntil: null }; },
    updateMany: async ({ where, data }) => {
      if (data.leaseToken === null) {
        if (releaseFails) throw Error('RELEASE_DB_DOWN');
        if (row.leaseToken === where.leaseToken) Object.assign(row, data);
        return { count: 1 };
      }
      acquisitions++;
      if (row.leaseToken && row.leaseUntil > new Date()) return { count: 0 };
      Object.assign(row, data); return { count: 1 };
    },
    count: async ({ where }) => row.leaseToken === where.leaseToken && row.leaseUntil > new Date() ? 1 : 0,
    findUniqueOrThrow: async () => ({ ...row }),
  }, waAuthKey: { findUnique: async () => null },
  $queryRaw: async () => [],
  $transaction: async fn => { if (writeFails) throw Error('WRITE_DB_DOWN'); return fn(db); } };
  const shared = {};
  const deps = { '../../lib/prisma': { prisma: db },
    '@whiskeysockets/baileys': { initAuthCreds: () => ({ me: { id: 'fixture' } }), BufferJSON: {}, proto: {} },
    './waStorage': { storageHash: x => x, sealWa: x => x },
    './authKeyMaintenance': { writeAuthKeys: async () => {} } };
  const api = load('src/server/libs/waAuthState.ts', deps, shared);
  const bundle = load('src/server/libs/waAuthState.ts', deps, shared);
  let auth = await api.createDatabaseAuthState('phone', 'unused', () => lost++);
  releaseFails = true;
  await assert.rejects(auth.close(), /RELEASE_DB_DOWN/);
  assert.equal(shared.doranDbAuth.has('phone'), false, 'Rejected close cannot remain cached');
  releaseFails = false;
  const oldToken = row.leaseToken;
  await assert.rejects(bundle.createDatabaseAuthState('phone', 'unused', () => {}), /WA_AUTH_IN_USE/);
  assert.equal(row.leaseToken, oldToken, 'Failed release must not bypass an unexpired lease');
  row.leaseUntil = new Date(0);
  auth = await bundle.createDatabaseAuthState('phone', 'unused', () => lost++);
  assert.notEqual(row.leaseToken, oldToken);
  assert.equal(acquisitions, 3, 'Reconnect reaches real acquisition after the DB recovers');
  writeFails = true;
  await assert.rejects(auth.saveCreds(), /WRITE_DB_DOWN/);
  assert.equal(lost, 1);
  await assert.rejects(auth.saveCreds(), /WRITE_DB_DOWN/, 'Old auth writes remain fail-closed');
  await assert.rejects(auth.close(), /WRITE_DB_DOWN/);
  assert.equal(row.leaseToken, null, 'Failed writes still release the matching lease');
  writeFails = false;
  auth = await api.createDatabaseAuthState('phone', 'unused', () => {});
  await auth.saveCreds();
  await auth.close();
  // Also cover an old rejected owner retained by a previous bundle/version.
  shared.doranDbAuth.set('phone', { close: async () => { throw Error('OLD_REJECTED_CLOSE'); } });
  auth = await bundle.createDatabaseAuthState('phone', 'unused', () => {});
  await auth.close();
  row.leaseToken = 'different-live-owner'; row.leaseUntil = new Date(Date.now() + 120000);
  await assert.rejects(api.createDatabaseAuthState('phone', 'unused', () => {}), /WA_AUTH_IN_USE/);
  assert.equal(row.leaseToken, 'different-live-owner');
}
async function statusRegression() {
  const shared = {}, retired = new WeakSet(), events = [];
  let row = { isOnline: true, status: 'OPEN' }, afterLock, fail = false;
  const db = { $transaction: async fn => {
    if (fail) throw Error('DB_DOWN');
    return fn({ $queryRaw: async () => { await afterLock?.(); }, phone: {
      updateMany: async ({ where, data }) => {
        if (row.isOnline !== where.isOnline) return { count: 0 };
        Object.assign(row, data); return { count: 1 };
      },
    } });
  } };
  // Imports are not executed; only reconciliation and the shared map are used.
  const deps = new Proxy({ '../../lib/prisma': { prisma: db },
    pino: { default: () => ({}) }, './phoneMaintenance': { retiredSockets: retired },
    './socket': { emitDeviceEvent: async (_, name, data) => events.push({ name, data }) },
  }, { has: () => true, get: (obj, key) => obj[key] || {} });
  const api = load('src/server/libs/makeWASocket.ts', deps, shared);
  const bundle = load('src/server/libs/makeWASocket.ts', deps, shared);
  assert.equal(api.session, bundle.session);
  await api.reconcileWaOffline('phone');
  assert.equal(row.isOnline, false); assert.equal(row.status, 'CLOSE');
  assert(row.lastOfflineAt instanceof Date); const firstOffline = row.lastOfflineAt;
  await bundle.reconcileWaOffline('phone');
  assert.equal(row.lastOfflineAt, firstOffline); assert.equal(events.length, 1);
  row = { isOnline: true, status: 'OPEN' }; fail = true;
  await assert.rejects(api.reconcileWaOffline('phone'), /DB_DOWN/);
  assert.equal(row.isOnline, true); fail = false;
  await bundle.reconcileWaOffline('phone'); assert.equal(row.isOnline, false);
  const connected = { ws: { isOpen: true }, user: { id: 'fixture' } };
  api.session.set('phone', connected); row = { isOnline: true, status: 'OPEN' };
  await api.reconcileWaOffline('phone'); assert.equal(row.isOnline, true);
  api.session.delete('phone'); afterLock = () => api.session.set('phone', connected);
  await api.reconcileWaOffline('phone'); assert.equal(row.isOnline, true, 'Replacement wins during DB wait');
  const connecting = { ws: { isOpen: false }, user: undefined };
  api.session.set('phone', connecting);
  afterLock = () => { connecting.ws.isOpen = true; connecting.user = { id: 'fixture' }; };
  await api.reconcileWaOffline('phone'); assert.equal(row.isOnline, true, 'Same socket can connect during DB wait');
  afterLock = undefined; retired.add(connecting);
  await api.reconcileWaOffline('phone'); assert.equal(row.isOnline, false, 'Retired transport is offline');
}
(async () => {
  await authRegression(); await statusRegression();
  console.log('AUTH_RECONNECT_OK: failed release/write recovery, live lease fencing, cross-bundle state, offline reconciliation, DB retry, replacement races');
})().catch(error => { console.error(error); process.exitCode = 1; });
