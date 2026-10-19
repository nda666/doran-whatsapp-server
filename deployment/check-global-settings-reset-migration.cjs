const assert = require('node:assert/strict');
const fs = require('node:fs');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
(async () => {
  const rows = await db.$queryRawUnsafe('SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations');
  assert(!rows.some(row => !row.finished_at && !row.rolled_back_at), 'An unfinished migration requires review');
  const applied = new Set(rows.filter(row => row.finished_at && !row.rolled_back_at).map(row => row.migration_name));
  const pending = fs.readdirSync('prisma/migrations', { withFileTypes: true }).filter(entry => entry.isDirectory() && !applied.has(entry.name)).map(entry => entry.name);
  assert(pending.length === 0 || (pending.length === 1 && pending[0] === '20261012170000_global_settings_password_reset'), 'Unrelated migrations pending');
  console.log('ONLY_GLOBAL_SETTINGS_RESET_MIGRATION_PENDING', pending.length);
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
