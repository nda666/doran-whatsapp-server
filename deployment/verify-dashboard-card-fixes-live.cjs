const assert = require('node:assert/strict');
const fs = require('node:fs');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const base = 'https://dashboard.jeblast.com';
(async () => {
  const admin = await db.user.findFirstOrThrow({ where: { email: 'admin@gmail.com', role: 'ADMIN', approvalStatus: 'APPROVED' } });
  const { encode } = require('next-auth/jwt');
  const jwt = await encode({ token: { id: admin.id, token: admin.token, name: admin.name, email: admin.email, role: admin.role, approvalStatus: admin.approvalStatus, sessionVersion: admin.sessionVersion }, secret: process.env.NEXTAUTH_SECRET });
  const response = await fetch(base + '/dashboard', { headers: { Cookie: '__Secure-next-auth.session-token=' + jwt + '; next-auth.session-token=' + jwt } });
  assert.equal(response.status, 200);
  const html = await response.text();
  const manifest = JSON.parse(fs.readFileSync('.next/build-manifest.json', 'utf8'));
  const bundle = manifest.pages['/dashboard'].map(file => fs.readFileSync('.next/' + file, 'utf8')).join('\n');
  // Dashboard cards initially show skeletons; their content loads through the API.
  assert(bundle.includes('Offline:'));
  // First card opens before the title, so include that element too.
  const heading = html.slice(0, html.indexOf('Analitik pengiriman'));
  assert.equal((heading.match(/style="height:100%"/g) || []).length, 3);
  const headers = { Authorization: 'Bearer ' + admin.token };
  const stats = await fetch(base + '/api/dashboard-stats', { headers });
  assert.equal(stats.status, 200);
  const data = await stats.json();
  assert(data.devices >= data.online);
  const source = fs.readFileSync('src/pages/dashboard/index.tsx', 'utf8');
  assert(source.includes('d.devices - d.online'));
  const all = await fetch(base + '/api/dispatch?limit=1', { headers });
  assert.equal(all.status, 200);
  const dispatch = await all.json();
  assert.equal(Object.values(dispatch.counts).reduce((sum, value) => sum + value, 0), dispatch.total);
  console.log('DASHBOARD_CARD_FIXES_LIVE_OK: equal-height styles on 3 cards; devices=' + data.devices + ', online=' + data.online + ', offline=' + (data.devices-data.online) + '; dispatch total matches status counts');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
