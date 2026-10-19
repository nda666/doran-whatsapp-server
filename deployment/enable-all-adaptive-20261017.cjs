'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const app = '/home/jeblast/repos/doran-whatsapp-server';
require(app + '/node_modules/@next/env').loadEnvConfig(app);
const { PrismaClient } = require(app + '/node_modules/@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const backup = '/home/jeblast/backups/adaptive-all-on-' + Date.now() + '.json';
  const result = await prisma.$transaction(async tx => {
    const phones = await tx.phone.findMany({ select: { id: true } });
    const ids = phones.map(phone => phone.id);
    const before = await tx.deviceSendPolicy.findMany({ where: { phoneId: { in: ids } }, select: { phoneId: true, adaptiveEnabled: true } });
    fs.writeFileSync(backup, JSON.stringify({ at: new Date(), phoneIds: ids, before }, null, 2), { mode: 0o600, flag: 'wx' });
    const created = ids.length ? await tx.deviceSendPolicy.createMany({ data: ids.map(phoneId => ({ phoneId, adaptiveEnabled: true })), skipDuplicates: true }) : { count: 0 };
    const updated = await tx.deviceSendPolicy.updateMany({ where: { phoneId: { in: ids }, adaptiveEnabled: false }, data: { adaptiveEnabled: true } });
    const on = await tx.deviceSendPolicy.count({ where: { phoneId: { in: ids }, adaptiveEnabled: true } });
    assert.equal(on, ids.length);
    return { total: ids.length, previouslyOn: before.filter(row => row.adaptiveEnabled).length, changedFromOff: updated.count, initialized: created.count, verifiedOn: on };
  }, { timeout: 30000 });
  const currentIds = (await prisma.phone.findMany({ select: { id: true } })).map(row => row.id);
  const currentOn = await prisma.deviceSendPolicy.count({ where: { phoneId: { in: currentIds }, adaptiveEnabled: true } });
  const remainingOff = currentIds.length - currentOn;
  assert.equal(remainingOff, 0);
  console.log(JSON.stringify({ ...result, remainingOff, backup }));
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
