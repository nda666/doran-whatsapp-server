'use strict';
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
// Refuse production and any non-loopback database.
const url = new URL(process.env.DATABASE_URL);
assert(['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname === '/doran_ci', 'Disposable CI database required');
const db = new PrismaClient();
const id = randomUUID();
let restoreCreated = false, restore, temp;
(async () => {
  const tables = await db.$queryRaw`SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`;
  assert(tables.length > 0);
  for (const row of tables) {
    const name = row.TABLE_NAME.replace(/`/g, '``');
    await db.$queryRawUnsafe(`SELECT * FROM \`${name}\` LIMIT 0`);
  }
  await db.user.create({ data: { id, name: 'CI smoke', email: `${id}@example.invalid`, password: 'ci-placeholder-no-login', token: randomUUID() } });
  assert.equal((await db.user.findUniqueOrThrow({ where: { id } })).name, 'CI smoke');
  await db.user.update({ where: { id }, data: { name: 'CI updated' } });
  assert.equal((await db.user.findUniqueOrThrow({ where: { id } })).name, 'CI updated');
  // Prove the production backup method can restore every CI table, including data.
  await db.$executeRawUnsafe('CREATE DATABASE `doran_ci_restore`');
  restoreCreated = true;
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'doran-ci-restore-'));
  const dump = path.join(temp, 'backup.sql');
  const backup = spawnSync(process.execPath, ['deployment/cd-database.cjs', 'dump', dump], { env: process.env, stdio: 'inherit', timeout: 60000 });
  assert.equal(backup.status, 0, 'Database dump must succeed');
  const fd = fs.openSync(dump, 'r');
  let imported;
  try {
    imported = spawnSync('mysql', ['--host=127.0.0.1', `--port=${url.port || '3306'}`, `--user=${decodeURIComponent(url.username)}`, 'doran_ci_restore'], {
      env: { ...process.env, MYSQL_PWD: decodeURIComponent(url.password) }, stdio: [fd, 'ignore', 'pipe'], timeout: 60000,
    });
  } finally { fs.closeSync(fd); }
  assert.equal(imported.status, 0, 'Backup import must succeed');
  const restoreUrl = new URL(url); restoreUrl.pathname = '/doran_ci_restore';
  restore = new PrismaClient({ datasources: { db: { url: restoreUrl.toString() } } });
  assert.deepEqual(await restore.user.findUniqueOrThrow({ where: { id } }), await db.user.findUniqueOrThrow({ where: { id } }));
  for (const row of tables) {
    const name = row.TABLE_NAME.replace(/`/g, '``');
    const original = await db.$queryRawUnsafe(`CHECKSUM TABLE \`${name}\` EXTENDED`);
    const restored = await restore.$queryRawUnsafe(`CHECKSUM TABLE \`${name}\` EXTENDED`);
    assert.notEqual(original[0].Checksum, null, 'Table checksums must be supported');
    assert.equal(String(original[0].Checksum), String(restored[0].Checksum), `Restored data mismatch: ${row.TABLE_NAME}`);
  }
  console.log('CI_DATABASE_ALL_TABLES_CRUD_BACKUP_RESTORE_AND_CHECKSUMS_PASSED');
})().catch(() => { console.error('CI_DATABASE_SMOKE_FAILED'); process.exitCode = 1; }).finally(async () => {
  if (restore) await restore.$disconnect();
  if (restoreCreated) await db.$executeRawUnsafe('DROP DATABASE `doran_ci_restore`');
  if (temp) fs.rmSync(temp, { recursive: true, force: true });
  await db.user.deleteMany({ where: { id } });
  await db.$disconnect();
});
