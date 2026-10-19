// Authenticated read-only production verification. No webhook test or WhatsApp send.
const assert = require('node:assert/strict');
const fs = require('node:fs');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const { encode } = require('next-auth/jwt');
const db = new PrismaClient();
const base = 'https://dashboard.jeblast.com';
(async () => {
  const owner = await db.user.findFirst({ where: { email: 'admin@gmail.com', role: 'ADMIN', approvalStatus: 'APPROVED' } });
  assert(owner?.token);
  const url = base + '/api/admin/dispatch-webhook';
  const response = await fetch(url, { headers: { Authorization: 'Bearer ' + owner.token }, signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.settings, { enabled: false, url: '', secretConfigured: false });
  assert.equal(body.events.length, 0);
  assert(!JSON.stringify(body).includes('"secret":'));
  assert.equal((await fetch(url)).status, 401);
  const ordinary = await db.user.findFirst({ where: { role: 'USER', approvalStatus: 'APPROVED' } });
  if (ordinary?.token) assert.equal((await fetch(url, { headers: { Authorization: 'Bearer ' + ordinary.token } })).status, 403);
  const jwt = await encode({ token: { id: owner.id, token: owner.token, name: owner.name, email: owner.email }, secret: process.env.NEXTAUTH_SECRET });
  const page = await fetch(base + '/dashboard/admin', { headers: { Cookie: '__Secure-next-auth.session-token=' + jwt }, signal: AbortSignal.timeout(20000) });
  assert.equal(page.status, 200);
  const html = await page.text();
  const pageData = JSON.parse(html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)[1]);
  assert.equal(pageData.buildId, fs.readFileSync('.next/BUILD_ID', 'utf8').trim());
  // Admin tabs depend on useSession, so their content is rendered after hydration.
  // Check the actual deployed page bundle, not labels absent from server-rendered HTML.
  const chunk = html.match(/src="([^"]*\/pages\/dashboard\/admin-[^"]+\.js)"/);
  assert(chunk, 'Admin page bundle missing');
  const bundleResponse = await fetch(new URL(chunk[1], base), { signal: AbortSignal.timeout(20000) });
  assert.equal(bundleResponse.status, 200);
  const bundle = await bundleResponse.text();
  for (const label of ['Webhook Status Pengiriman', 'Webhook URL Kasir', 'Kunci Autentikasi Webhook', 'Webhook Perangkat']) assert(bundle.includes(label), label);
  console.log('DISPATCH_WEBHOOK_LIVE_OK_ADMIN_FORM_EMPTY_DISABLED_MASKED_SECRET_ACCESS_NO_EXTERNAL_SEND');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
