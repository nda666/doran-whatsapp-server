'use strict';
// Only run with the application stopped. Export current DB keys before an old-runtime rollback.
const fs = require('node:fs/promises'), path = require('node:path'), assert = require('node:assert/strict');
require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const { prisma } = require('../dist/src/lib/prisma');
const { openWa } = require('../dist/src/server/libs/waStorage');
(async () => {
  assert.equal(process.env.WA_AUTH_EXPORT_STOPPED, '1');
  const root = path.resolve(process.env.WHATSAPP_AUTH_FOLDER || './storage/whatsapp-auth');
  const sessions = await prisma.waAuthSession.findMany({ where: { migratedAt: { not: null } } });
  let exported = 0;
  for (const session of sessions) {
    if (session.leaseToken && session.leaseUntil > new Date()) throw Error('Live auth lease');
    const phone = await prisma.phone.findUnique({ where: { id: session.phoneId }, select: { userId: true } });
    if (!phone) continue;
    assert(/^[a-zA-Z0-9_-]+$/.test(phone.userId) && /^[a-zA-Z0-9_-]+$/.test(session.phoneId));
    const folder = path.resolve(root, `${phone.userId}-${session.phoneId}`);
    assert.equal(path.dirname(folder), root);
    await fs.mkdir(folder, { recursive: true, mode: 0o700 });
    assert(!(await fs.lstat(folder)).isSymbolicLink());
    const rows = await prisma.waAuthKey.findMany({ where: { phoneId: session.phoneId } });
    const names = new Set(rows.map(row => row.keyName));
    for (const name of await fs.readdir(folder)) if (name.endsWith('.json') && !names.has(name)) await fs.unlink(path.join(folder, name));
    for (const row of rows) {
      assert(row.keyName.endsWith('.json') && path.basename(row.keyName) === row.keyName && !/[\\/]/.test(row.keyName));
      const file = path.join(folder, row.keyName), temp = `${file}.rollback-tmp`;
      await fs.writeFile(temp, openWa(row.value, `${session.phoneId}:${row.keyHash}`), { mode: 0o600 });
      await fs.rename(temp, file);
    }
    exported++;
  }
  console.log('CURRENT_AUTH_EXPORTED_FOR_ROLLBACK', exported);
})().catch(() => { console.error('AUTH_EXPORT_FAILED; DO_NOT_START_OLD_RUNTIME_WITH_STALE_KEYS'); process.exitCode = 1; }).finally(() => prisma.$disconnect());
