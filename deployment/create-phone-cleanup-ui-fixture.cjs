const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
(async () => {
  const stamp = Date.now();
  const owner = await db.user.create({ data: { name: 'Uji tampilan', email: `codex-cleanup-${stamp}-ui@example.invalid`, password: randomUUID(), token: randomUUID(), role: 'USER', approvalStatus: 'APPROVED', isActive: true } });
  try {
    const phone = await db.phone.create({ data: { name: 'Uji tampilan perangkat', userId: owner.id, active: 0, webhookUrl: 'https://example.invalid/cleanup-test' } });
    await fs.writeFile('deployment/phone-cleanup-live-fixture.json', JSON.stringify({ phoneId: phone.id, userId: owner.id, label: phone.name, testUserIds: [owner.id] }));
    console.log('UI_FIXTURE_CREATED', phone.name);
  } catch (error) { await db.user.delete({ where: { id: owner.id } }); throw error; }
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
