// Read-only verification of persisted timestamps, API access and sorting.
const assert = require('node:assert/strict');
require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const db = new (require('@prisma/client').PrismaClient)();
(async () => {
  const admin = await db.user.findFirstOrThrow({ where: { role: 'ADMIN', isActive: true } });
  const token = await require('next-auth/jwt').encode({ token: { id: admin.id, email: admin.email, sessionVersion: admin.sessionVersion }, secret: process.env.NEXTAUTH_SECRET, maxAge: 120 });
  const base = process.env.PHONE_LAST_SEND_TEST_BASE || 'http://127.0.0.1:3000';
  const headers = { Cookie: '__Secure-next-auth.session-token=' + token + '; next-auth.session-token=' + token };
  for (const order of ['asc', 'desc']) {
    const response = await fetch(base + '/api/phones?page=1&limit=20&sort=lastSendProcessedAt&order=' + order, { headers });
    assert.equal(response.status, 200);
    const body = await response.json(); assert(Array.isArray(body.data)); assert(body.data.length > 0);
    const stamps = body.data.map(row => {
      assert('lastSendProcessedAt' in row);
      assert(row.lastSendProcessedAt === null || Number.isFinite(Date.parse(row.lastSendProcessedAt)));
      return row.lastSendProcessedAt === null ? -Infinity : Date.parse(row.lastSendProcessedAt);
    });
    for (let i = 1; i < stamps.length; i++) assert(order === 'asc' ? stamps[i - 1] <= stamps[i] : stamps[i - 1] >= stamps[i], 'Timestamp sort order');
    for (const row of body.data) {
      const saved = await db.phone.findUniqueOrThrow({ where: { id: row.id }, select: { lastSendProcessedAt: true } });
      if (row.lastSendProcessedAt) assert(Date.parse(row.lastSendProcessedAt) <= saved.lastSendProcessedAt.getTime());
    }
  }
  const policies = await fetch(base + '/api/device-policies', { headers });
  assert.equal(policies.status, 200);
  const data = await policies.json(); assert(data.length > 0);
  for (const row of data) {
    const phone = await db.phone.findUniqueOrThrow({ where: { id: row.id }, select: { lastSendProcessedAt: true } });
    // Sends can advance during verification; the API snapshot may precede the DB read.
    assert('lastSendProcessedAt' in row);
    assert(row.lastSendProcessedAt === null || Number.isFinite(Date.parse(row.lastSendProcessedAt)));
    if (row.lastSendProcessedAt) assert(Date.parse(row.lastSendProcessedAt) <= phone.lastSendProcessedAt.getTime());
  }
  assert.equal((await fetch(base + '/api/phones?page=1')).status, 401);
  assert.equal((await fetch(base + '/api/device-policies')).status, 401);
  console.log('PHONE_LAST_SEND_LIVE_OK: persisted timestamp field, sorting both directions, anonymous access rejected');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
