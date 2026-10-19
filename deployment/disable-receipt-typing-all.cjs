const fs = require('node:fs');
const path = require('node:path');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
(async () => {
  const backup = process.argv[2];
  if (!backup || !path.isAbsolute(backup)) throw new Error('Absolute backup path required');
  const result = await db.$transaction(async tx => {
    const before = await tx.phone.findMany({ select: { id: true, readReceipt: true, showTyping: true } });
    fs.writeFileSync(backup, JSON.stringify(before), { mode: 0o600, flag: 'wx' });
    const changed = await tx.phone.updateMany({ where: { OR: [{ readReceipt: true }, { showTyping: true }] }, data: { readReceipt: false, showTyping: false } });
    const remaining = await tx.phone.count({ where: { OR: [{ readReceipt: true }, { showTyping: true }] } });
    if (remaining) throw new Error('Some devices still enabled');
    return { total: before.length, changed: changed.count, remainingEnabled: remaining };
  });
  console.log(JSON.stringify(result));
})().catch(error => { console.error(error.code || error.name); process.exitCode = 1; }).finally(() => db.$disconnect());
