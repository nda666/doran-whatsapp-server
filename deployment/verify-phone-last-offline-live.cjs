// Read-only verification of persisted timestamps, API access and sorting.
const assert = require('node:assert/strict');
require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const db = new (require('@prisma/client').PrismaClient)();
(async () => {
  const admin = await db.user.findFirstOrThrow({ where: { role: 'ADMIN', isActive: true } });
  const token = await require('next-auth/jwt').encode({ token: { id: admin.id, email: admin.email, sessionVersion: admin.sessionVersion }, secret: process.env.NEXTAUTH_SECRET, maxAge: 120 });
  const base = process.env.PHONE_LAST_OFFLINE_TEST_BASE || 'http://127.0.0.1:3000';
  const headers = { Cookie: '__Secure-next-auth.session-token=' + token + '; next-auth.session-token=' + token };
  for (const order of ['asc', 'desc']) {
    const response = await fetch(base + '/api/phones?page=1&limit=20&sort=lastOfflineAt&order=' + order, { headers });
    assert.equal(response.status, 200);
    const body = await response.json(); assert(Array.isArray(body.data)); assert(body.data.length > 0);
    const expected = await db.phone.findMany({ take: 20, orderBy: { lastOfflineAt: order }, select: { id: true, lastOfflineAt: true } });
    assert.equal(body.data.length, expected.length);
    const times = body.data.map(row => {
      assert('lastOfflineAt' in row);
      assert(row.lastOfflineAt === null || Number.isFinite(Date.parse(row.lastOfflineAt)));
      return row.lastOfflineAt;
    });
    // Ties (especially legacy NULL rows) need not have a deterministic ID order.
    assert.deepEqual(times, expected.map(row => row.lastOfflineAt?.toISOString() || null));
  }
  assert.equal((await fetch(base + '/api/phones?page=1')).status, 401);
  console.log('PHONE_LAST_OFFLINE_LIVE_OK: persisted timestamp field, sorting both directions, anonymous access rejected');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
