const assert = require('node:assert/strict');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
(async () => {
  const owner = await db.user.findFirstOrThrow({ where: { role: 'ADMIN', email: 'admin@gmail.com' } });
  const base = 'https://dashboard.jeblast.com';
  const headers = { Authorization: 'Bearer ' + owner.token };
  const get = query => fetch(base + '/api/admin/webhook-logs?' + new URLSearchParams(query), { headers, signal: AbortSignal.timeout(25000) });
  assert.equal((await fetch(base + '/api/admin/webhook-logs')).status, 401);
  assert.equal((await get({ type: 'invalid' })).status, 400);
  assert.equal((await get({ limit: '101' })).status, 400);
  const other = await db.user.findFirst({ where: { approvalStatus: 'APPROVED', email: { not: owner.email }, token: { not: '' } } });
  if (other) assert.equal((await fetch(base + '/api/admin/webhook-logs', { headers: { Authorization: 'Bearer ' + other.token } })).status, 403);
  for (const type of ['all', 'dispatch', 'device']) {
    const response = await get({ type, limit: '10' }); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    const result = await response.json(); assert(result.data.length <= 10); assert(result.total >= result.data.length);
    if (type !== 'all') assert(result.data.every(row => row.type === type));
    if (result.data[0]) {
      const row = result.data[0];
      const detail = await get({ type: row.type, id: row.id }); assert.equal(detail.status, 200);
      const event = (await detail.json()).event; assert.equal(event.eventId, row.eventId); assert(!('leaseToken' in event));
      const search = await get({ type: row.type, q: row.eventId }); assert.equal(search.status, 200);
      assert((await search.json()).data.some(found => found.eventId === row.eventId));
    }
  }
  for (const filter of [{ status: 'FAILED' }, { from: '2026-10-10T17:00:00.000Z', to: '2026-10-12T16:59:59.999Z' }, { q: "%' OR 1=1 --" }, { page: '2', limit: '5' }]) assert.equal((await get(filter)).status, 200);
  assert.equal((await get({ sort: 'invalid' })).status, 400);
  for (const order of ['asc', 'desc']) {
    const response = await get({ sort: 'createdAt', order, limit: '5' }); assert.equal(response.status, 200);
    const result = await response.json();
    for (let i = 1; i < result.data.length; i++) {
      const previous = new Date(result.data[i - 1].createdAt).getTime(), current = new Date(result.data[i].createdAt).getTime();
      assert(order === 'asc' ? previous <= current : previous >= current);
    }
  }
  const { encode } = require('next-auth/jwt');
  const jwt = await encode({ token: { id: owner.id, token: owner.token, name: owner.name, email: owner.email }, secret: process.env.NEXTAUTH_SECRET });
  const page = await fetch(base + '/dashboard/admin', { headers: { Cookie: '__Secure-next-auth.session-token=' + jwt } }); assert.equal(page.status, 200);
  const html = await page.text();
  const chunks = [...html.matchAll(/<script[^>]*src="([^"]+\.js)"/g)].map(match => match[1]);
  const js = (await Promise.all(chunks.map(async chunk => (await fetch(new URL(chunk, base))).text()))).join('\n');
  for (const label of ['Log Pengiriman Webhook', 'Lihat Log Lengkap', '/api/admin/webhook-logs', 'Lihat Detail']) assert(js.includes(label));
  assert(js.includes('data per halaman')); assert(js.includes('Jumlah data:'));
  console.log('WEBHOOK_LOGS_LIVE_SQL_FILTERS_DETAILS_AUTH_PAGE_BUNDLE_PASSED');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
