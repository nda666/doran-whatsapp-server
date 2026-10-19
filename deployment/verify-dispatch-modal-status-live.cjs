const assert = require('node:assert/strict');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
(async () => {
  const owner = await db.user.findFirst({ where: { role: 'ADMIN', email: 'admin@gmail.com' } }); assert(owner);
  const headers = { Authorization: 'Bearer ' + owner.token };
  const response = await fetch('https://dashboard.jeblast.com/api/dispatch?transaction_id=5553753&limit=100', { headers, signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, 200); const body = await response.json(); assert(body.data.length, 'Transaction not found');
  const statuses = [];
  for (const row of body.data) {
    const stored = await db.waDispatch.findUnique({ where: { id: row.id }, select: { status: true, transactionId: true } });
    assert.equal(stored.transactionId, '5553753');
    const detailResponse = await fetch('https://dashboard.jeblast.com/api/dispatch?id=' + encodeURIComponent(row.id), { headers, signal: AbortSignal.timeout(20000) });
    assert.equal(detailResponse.status, 200); const detail = await detailResponse.json();
    assert.equal(detail.id, row.id); assert.equal(detail.status, stored.status); assert.equal(detail.status, row.status);
    assert.equal(typeof detail.content_available, 'boolean'); statuses.push(detail.status);
  }
  console.log('TRANSACTION_5553753_LIST_DETAIL_DB_STATUSES', JSON.stringify(statuses));
  if (!process.argv.includes('--inspect')) {
    require('./verify-dispatch-modal-status.cjs');
    require('./verify-dispatch-updated-at-live.cjs');
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
