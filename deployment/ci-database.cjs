'use strict';
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
// Refuse production and any non-loopback database.
const url = new URL(process.env.DATABASE_URL);
assert(['127.0.0.1', 'localhost'].includes(url.hostname) && url.pathname === '/doran_ci', 'Disposable CI database required');
const db = new PrismaClient();
const id = randomUUID();
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
  console.log('CI_DATABASE_TABLE_READS_AND_USER_CRUD_PASSED');
})().catch(() => { console.error('CI_DATABASE_SMOKE_FAILED'); process.exitCode = 1; }).finally(async () => {
  await db.user.deleteMany({ where: { id } });
  await db.$disconnect();
});
