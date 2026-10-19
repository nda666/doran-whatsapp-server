const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
(async () => {
  if (process.argv[2] === 'cleanup') {
    const id = process.argv[3]; assert(/^[0-9a-f-]{36}$/.test(id));
    const result = await db.waDispatch.deleteMany({ where: { id, storeId: 'webhook-ui-test', lastError: 'SYNTHETIC_UI_TEST', status: 'FAILED' } });
    console.log(JSON.stringify({ cleaned: result.count })); return;
  }
  assert.equal(process.argv[2], 'create');
  const owner = await db.user.findFirstOrThrow({ where: { role: 'ADMIN', email: 'admin@gmail.com' } });
  const phone = await db.phone.findFirstOrThrow({ where: { userId: owner.id } });
  const id = randomUUID(), hash = createHash('sha256').update(id).digest('hex');
  await db.waDispatch.create({ data: { id, userId: owner.id, phoneId: phone.id,
    storeId: 'webhook-ui-test', transactionId: 'webhook-ui-test-' + id,
    messageKey: 'endpoint-test', recipient: '6280000000000', dedupeKey: hash, payloadHash: hash,
    message: '', status: 'FAILED', lastError: 'SYNTHETIC_UI_TEST', expiresAt: new Date(Date.now() + 3600000) } });
  console.log(JSON.stringify({ id }));
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
