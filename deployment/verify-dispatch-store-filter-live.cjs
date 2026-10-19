const assert = require('node:assert/strict');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const base = 'https://dashboard.jeblast.com';
const { defaultDispatchDates, dispatchDateFilter } = require('../dist/src/lib/dispatchDateFilter');
(async () => {
  const admin = await db.user.findFirstOrThrow({ where: { email: 'admin@gmail.com', role: 'ADMIN' } });
  const ordinary = await db.user.findFirst({ where: { role: 'USER', approvalStatus: 'APPROVED', isActive: true } });
  const dates = defaultDispatchDates();
  const range = dispatchDateFilter(dates.start_date, dates.end_date);
  for (const user of [admin, ordinary].filter(Boolean)) {
    const headers = { Authorization: 'Bearer ' + user.token };
    const params = new URLSearchParams({ ...dates, limit: '100', status: '' });
    const response = await fetch(base + '/api/dispatch?' + params, { headers });
    assert.equal(response.status, 200);
    const body = await response.json();
    const where = { ...(user === admin ? {} : { userId: user.id }), createdAt: { gt: new Date(body.display_cutoff), ...range } };
    assert.equal(body.total, await db.waDispatch.count({ where }));
    assert.equal(body.total, Object.values(body.counts).reduce((sum, n) => sum + n, 0));
    assert(body.data.every(job => new Date(job.created_at) >= range.gte && new Date(job.created_at) < range.lt));
    const filtered = await (await fetch(base + '/api/dispatch?' + params + '&store_id=__date_filter_missing_store__', { headers })).json();
    assert.equal(filtered.total, 0); assert.deepEqual(filtered.counts, body.counts);
    assert.equal((await fetch(base + '/api/dispatch?start_date=2026-02-30&end_date=2026-03-01', { headers })).status, 400);
    assert.equal((await fetch(base + '/api/dispatch?start_date=2026-10-15&end_date=2026-10-14', { headers })).status, 400);
  }
  const headers = { Authorization: 'Bearer ' + admin.token };
  const params = new URLSearchParams({ ...dates, limit: '100', status: '' });
  const unfiltered = await (await fetch(base + '/api/dispatch?' + params, { headers })).json();
  for (const [filter, storeId] of [['non_default', { not: 'default' }], ['default', 'default']]) {
    const response = await fetch(base + '/api/dispatch?' + params + '&store_filter=' + filter, { headers });
    assert.equal(response.status, 200);
    const body = await response.json();
    const where = { createdAt: { gt: new Date(body.display_cutoff), ...range }, storeId };
    assert.equal(body.total, await db.waDispatch.count({ where }));
    assert(body.data.every(job => filter === 'non_default' ? job.store_id !== 'default' : job.store_id === 'default'));
    assert.deepEqual(body.counts, unfiltered.counts);
  }
  const conflict = await (await fetch(base + '/api/dispatch?' + params + '&store_filter=non_default&store_id=default', { headers })).json();
  assert.equal(conflict.total, 0);
  const { encode } = require('next-auth/jwt');
  const jwt = await encode({ token: { id: admin.id, token: admin.token, name: admin.name, email: admin.email, role: admin.role, approvalStatus: admin.approvalStatus, sessionVersion: admin.sessionVersion }, secret: process.env.NEXTAUTH_SECRET });
  const response = await fetch(base + '/dashboard/dispatch', { headers: { Cookie: '__Secure-next-auth.session-token=' + jwt + '; next-auth.session-token=' + jwt } });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert(html.includes('Filter store'));
  assert(html.includes('Tanggal mulai') && html.includes('Tanggal selesai'));
  const assets = [...html.matchAll(/(?:src|href)="([^" ]+\.(?:js|css)(?:\?[^" ]*)?)"/g)].map(m => m[1]);
  assert(assets.length);
  for (const url of assets) assert.equal((await fetch(new URL(url, base))).status, 200);
  console.log('DISPATCH_STORE_FILTER_LIVE_OK: store exclusions, defaults, database totals, search composition, date fields, WIB boundaries, counts against database, owner scope, search composition, validation and assets');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
