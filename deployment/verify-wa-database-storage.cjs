'use strict';
// Explicit integration check against only synthetic rows in the new tables.
// The deployer runs this with the application stopped, after backup/schema upgrade.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), { randomUUID } = require('node:crypto');
require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const { prisma } = require('../dist/src/lib/prisma');
const auth = require('../dist/src/server/libs/waAuthState');
const { sealWa, openWa } = require('../dist/src/server/libs/waStorage');
const id = randomUUID(), dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-db-check-'));
let current, competing;
(async () => {
  assert.equal(process.env.WA_HARDENING_DB_TEST, '1', 'Explicit integration-test switch required');
  const { initAuthCreds, BufferJSON } = await import('@whiskeysockets/baileys');
  const credentials = initAuthCreds();
  fs.writeFileSync(path.join(dir, 'creds.json'), JSON.stringify(credentials, BufferJSON.replacer), { mode: 0o600 });
  current = await auth.createDatabaseAuthState(id, dir, () => {});
  assert.deepEqual(current.state.creds.noiseKey, credentials.noiseKey);
  await current.state.keys.set({ tctoken: { integration: { token: Buffer.from('synthetic-token') } } });
  assert.equal((await current.state.keys.get('tctoken', ['integration'])).integration.token.toString(), 'synthetic-token');
  const rows = await prisma.waAuthKey.findMany({ where: { phoneId: id } });
  assert(rows.length >= 2 && rows.every(row => row.value.startsWith('wa1:')));
  // A second module context represents a competing process with independent memory.
  const oldOwners = globalThis.doranDbAuth;
  globalThis.doranDbAuth = new Map();
  delete require.cache[require.resolve('../dist/src/server/libs/waAuthState')];
  const other = require('../dist/src/server/libs/waAuthState');
  await assert.rejects(other.createDatabaseAuthState(id, dir, () => {}), /WA_AUTH_IN_USE/);
  await prisma.waAuthSession.update({ where: { phoneId: id }, data: { leaseUntil: new Date(0) } });
  competing = await other.createDatabaseAuthState(id, dir, () => {});
  await assert.rejects(current.saveCreds(), /WA_AUTH_LEASE_LOST/);
  await current.close().catch(() => {}); current = null;
  await competing.close(); competing = null;
  globalThis.doranDbAuth = oldOwners;
  await auth.clearDatabaseAuth(id);
  assert.equal((await auth.readDatabaseCreds(id)).creds, null);
  assert.equal(openWa(sealWa('test', id), id), 'test');
  console.log('REAL_MYSQL_ENCRYPTED_AUTH_IMPORT_KEYS_LEASE_FENCING_LOGOUT_PASSED');
})().catch(error => { console.error(error.name, 'WA_DATABASE_STORAGE_CHECK_FAILED'); process.exitCode = 1; })
  .finally(async () => {
    await current?.close().catch(() => {}); await competing?.close().catch(() => {});
    await prisma.waAuthKey.deleteMany({ where: { phoneId: id } });
    await prisma.waAuthSession.deleteMany({ where: { phoneId: id } });
    await prisma.$disconnect();
    for (const name of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, name)); fs.rmdirSync(dir);
  });
