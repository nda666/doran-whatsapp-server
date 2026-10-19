const assert = require('node:assert/strict');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const base = 'https://dashboard.jeblast.com';
(async () => {
  const admin = await db.user.findFirstOrThrow({ where: { email: 'admin@gmail.com', role: 'ADMIN', approvalStatus: 'APPROVED', isActive: true } });
  const users = [admin];
  const ordinary = await db.user.findFirst({ where: { role: 'USER', approvalStatus: 'APPROVED', isActive: true } });
  if (ordinary) users.push(ordinary);
  for (const user of users) {
    const { encode } = require('next-auth/jwt');
    const jwt = await encode({ token: { id: user.id, token: user.token, name: user.name, email: user.email, role: user.role, approvalStatus: user.approvalStatus, sessionVersion: user.sessionVersion }, secret: process.env.NEXTAUTH_SECRET });
    const headers = { Cookie: '__Secure-next-auth.session-token=' + jwt + '; next-auth.session-token=' + jwt };
    const response = await fetch(base + '/dashboard', { headers });
    assert.equal(response.status, 200);
    assert.equal(new URL(response.url).pathname, '/dashboard');
    const html = await response.text();
    // Summary cards render skeletons on the server; links appear after API hydration.
    const dashboardAsset = [...html.matchAll(/src="([^" ]+\/pages\/dashboard-[^" ]+\.js)"/g)][0];
    assert(dashboardAsset, 'Dashboard page bundle missing');
    const bundleResponse = await fetch(new URL(dashboardAsset[1], base));
    assert.equal(bundleResponse.status, 200);
    const bundle = await bundleResponse.text();
    for (const [path, label] of [['/dashboard/phone', 'Lihat Detail Perangkat'], ['/dashboard/dispatch', 'Lihat Antrean Pengiriman']]) {
      assert(bundle.includes(label) && bundle.includes(path), label);
      const destination = await fetch(base + path, { headers });
      assert.equal(destination.status, 200);
      assert.equal(new URL(destination.url).pathname, path);
    }
    for (const match of html.matchAll(/(?:src|href)="([^" ]+\.(?:js|css)(?:\?[^" ]*)?)"/g)) {
      assert.equal((await fetch(new URL(match[1], base))).status, 200);
    }
    const stats = await fetch(base + '/api/dashboard-stats', { headers });
    assert.equal(stats.status, 200);
    const data = await stats.json();
    const scope = user.id === admin.id ? {} : { userId: user.id };
    assert.equal(data.devices, await db.phone.count({ where: scope }));
    assert(data.online >= 0 && data.online <= data.devices);
    const source = require('node:fs').readFileSync('src/pages/dashboard/index.tsx', 'utf8');
    assert(source.includes('value={d?.devices || 0}'));
    assert(source.includes('value={(c.QUEUED || 0) + (c.PROCESSING || 0)}'));
    const grouped = await db.waDispatch.groupBy({ by: ['status'], where: { ...scope, createdAt: { gt: new Date(data.period.start) } }, _count: { _all: true } });
    const actual = Object.fromEntries(grouped.map(r => [r.status, r._count._all]));
    // Active deliveries may change status between the API and database read.
    const apiTotal = Object.values(data.counts).reduce((n, v) => n + v, 0);
    const dbTotal = Object.values(actual).reduce((n, v) => n + v, 0);
    assert(Math.abs(apiTotal - dbTotal) <= 20, 'Dispatch totals diverged');
    console.log('DASHBOARD_SHORTCUTS_LIVE_OK', user.id === admin.id ? 'admin' : 'user', JSON.stringify({ devices: data.devices, online: data.online, waiting: (data.counts.QUEUED || 0) + (data.counts.PROCESSING || 0), apiTotal, dbTotal }));
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
