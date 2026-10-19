const assert = require('node:assert/strict');
const fs = require('node:fs');
require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const db = new (require('@prisma/client').PrismaClient)();
(async () => {
  const rows = await db.$queryRawUnsafe('SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations');
  assert(!rows.some(row => !row.finished_at && !row.rolled_back_at), 'Unresolved migration found');
  const applied = new Set(rows.filter(row => row.finished_at && !row.rolled_back_at).map(row => row.migration_name));
  const pending = fs.readdirSync('prisma/migrations', { withFileTypes: true }).filter(entry => entry.isDirectory() && !applied.has(entry.name)).map(entry => entry.name);
  assert.deepEqual(pending, ['20261019090000_device_delay_range'], 'Unexpected pending migrations');
  console.log('ONLY_DEVICE_DELAY_RANGE_MIGRATION_PENDING');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
