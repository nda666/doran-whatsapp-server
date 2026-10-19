const assert = require('node:assert/strict');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const owner = await p.user.findFirst({ where: { role: 'ADMIN' } });
  assert(owner, 'No admin available for read-only verification');
  const { encode } = require('next-auth/jwt');
  const jwt = await encode({ token: { id: owner.id, token: owner.token, name: owner.name, email: owner.email }, secret: process.env.NEXTAUTH_SECRET });
  for (const page of ['campaigns', 'contacts', 'media', 'api-docs', 'admin', 'reports', 'phone', 'log']) {
    const response = await fetch('https://dashboard.jeblast.com/dashboard/' + page, { redirect: 'manual', headers: { Cookie: '__Secure-next-auth.session-token=' + jwt } });
    assert.equal(response.status, 200, 'Public authenticated page ' + page);
    const html = await response.text();
    assert(html.includes('__NEXT_DATA__'), page);
    console.log('PUBLIC_AUTHENTICATED_PAGE_OK', page);
  }
  const routes = ['/api/phones?page=1', '/api/campaigns', '/api/contacts', '/api/contacts/groups', '/api/media', '/api/dashboard-stats', '/api/reports?start=2026-10-01&end=2026-10-10', '/api/search?q=test', '/api/admin/users', '/api/admin/settings', '/api/admin/update', '/api/dispatch?page=1', '/api/log?page=1'];
  for (const route of routes) {
    const response = await fetch('http://127.0.0.1:3000' + route, { headers: { Authorization: 'Bearer ' + owner.token } });
    assert.equal(response.status, 200, route);
    const body = await response.json();
    if (route === '/api/admin/update') assert.equal(body.pendingMigrations.length, 0);
    console.log('READ_ONLY_API_OK', route);
  }
  const unauth = await fetch('http://127.0.0.1:3000/api/campaigns');
  assert.equal(unauth.status, 401);
  const incomplete = await p.$queryRawUnsafe('SELECT COUNT(*) AS count FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL');
  assert.equal(Number(incomplete[0].count), 0);
  console.log(JSON.stringify({ devices: await p.phone.count(), active: await p.phone.count({where:{active:1}}), online: await p.phone.count({where:{isOnline:true}}), campaigns: await p.campaign.count(), whatsappEnabled: process.env.WHATSAPP_ENABLED === 'true', dispatchEnabled: process.env.DISPATCH_QUEUE_ENABLED === 'true' }));
  console.log('LIVE_READ_ONLY_VERIFICATION_OK_NO_TEST_SEND');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => p.$disconnect());
