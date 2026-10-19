'use strict';
// Production helper: stdout contains counts/migration metadata, never rows or credentials.
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient({ log: [] });
async function main() {
  const mode = process.argv[2];
  if (mode === 'dump') {
    const destination = process.argv[3];
    const url = new URL(process.env.DATABASE_URL);
    const fd = fs.openSync(destination, 'wx', 0o600);
    try {
      const result = spawnSync('mysqldump', [
        '--single-transaction', '--quick', '--skip-lock-tables', '--hex-blob', '--no-tablespaces',
        `--host=${url.hostname}`, `--port=${url.port || '3306'}`,
        `--user=${decodeURIComponent(url.username)}`, decodeURIComponent(url.pathname.slice(1)),
      ], { env: { ...process.env, MYSQL_PWD: decodeURIComponent(url.password) }, stdio: ['ignore', fd, 'pipe'], timeout: 600000 });
      if (result.error || result.status !== 0 || fs.fstatSync(fd).size === 0) throw Error('Database backup failed (details suppressed)');
    } finally { fs.closeSync(fd); }
    return;
  }
  if (mode === 'audit') {
    const tables = await db.$queryRaw`SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`;
    const counts = {};
    for (const row of tables) {
      const name = row.TABLE_NAME;
      const result = await db.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM \`${name.replace(/`/g, '``')}\``);
      counts[name] = String(result[0].n);
    }
    const migrations = await db.$queryRaw`SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at`;
    process.stdout.write(JSON.stringify({ counts, migrations }));
    return;
  }
  if (mode === 'health') {
    const port = process.env.PORT || '3000';
    const login = await fetch(`http://127.0.0.1:${port}/signin`, { signal: AbortSignal.timeout(10000) });
    if (login.status !== 200) throw Error('Login health failed');
    const { SUPER_ADMIN_EMAIL } = require('../dist/src/lib/access');
    const admin = await db.user.findFirst({ where: { email: SUPER_ADMIN_EMAIL, role: 'ADMIN', approvalStatus: 'APPROVED', isActive: true } });
    if (!admin?.token) throw Error('Active super admin required for dispatch health');
    const response = await fetch(`http://127.0.0.1:${port}/health/dispatch`, {
      headers: { Authorization: `Bearer ${admin.token}` }, signal: AbortSignal.timeout(10000),
    });
    if (response.status !== 200 || !(await response.json()).healthy) throw Error('Dispatch health failed');
    await db.$queryRaw`SELECT 1`;
    console.log('LOGIN_DATABASE_DISPATCH_HEALTH_OK');
    return;
  }
  throw Error('Unknown database operation');
}
main().catch(() => { console.error('DEPLOY_DATABASE_CHECK_FAILED (credentials and query output suppressed)'); process.exitCode = 1; }).finally(() => db.$disconnect());
