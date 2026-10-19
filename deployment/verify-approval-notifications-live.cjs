const assert = require('node:assert/strict');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
(async () => {
  const owner = await db.user.findFirstOrThrow({ where: { role: 'ADMIN', email: 'admin@gmail.com', approvalStatus: 'APPROVED' } });
  const base = 'https://dashboard.jeblast.com';
  const url = base + '/api/admin/approval-notifications';
  const headers = { Authorization: 'Bearer ' + owner.token };
  assert.equal((await fetch(url)).status, 401);
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(25000) });
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  const result = await response.json();
  assert.deepEqual(Object.keys(result), ['pendingCount']);
  assert.equal(result.pendingCount, await db.user.count({ where: { approvalStatus: 'PENDING' } }));
  assert.equal((await fetch(url, { method: 'POST', headers })).status, 405);
  const other = await db.user.findFirst({ where: { approvalStatus: 'APPROVED', email: { not: owner.email }, token: { not: '' } } });
  if (other) assert.equal((await fetch(url, { headers: { Authorization: 'Bearer ' + other.token } })).status, 403);
  const { encode } = require('next-auth/jwt');
  const jwt = await encode({ token: { id: owner.id, token: owner.token, name: owner.name, email: owner.email }, secret: process.env.NEXTAUTH_SECRET });
  const page = await fetch(base + '/dashboard/admin?tab=users&status=PENDING', { headers: { Cookie: '__Secure-next-auth.session-token=' + jwt } });
  assert.equal(page.status, 200);
  // The navbar hydrates after SessionProvider fetches the session in the browser.
  const html = await page.text();
  const chunks = [...html.matchAll(/<script[^>]*src="([^"]+\.js)"/g)].map(match => match[1]);
  const js = (await Promise.all(chunks.map(async chunk => (await fetch(new URL(chunk, base))).text()))).join('\n');
  for (const label of ['Notifikasi persetujuan user', '/api/admin/approval-notifications', '/dashboard/admin?tab=users&status=PENDING', 'dashboard:users-updated', 'Lihat permintaan persetujuan']) assert(js.includes(label), label);
  console.log('APPROVAL_NOTIFICATIONS_LIVE_OK: protected API, database count, navbar, pending link and refresh; pending=' + result.pendingCount);
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
