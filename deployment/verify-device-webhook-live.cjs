const assert = require('node:assert/strict');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const { createHash } = require('node:crypto');
(async () => {
  const admin = await p.user.findFirstOrThrow({ where: { email: 'admin@gmail.com', role: 'ADMIN', approvalStatus: 'APPROVED' } });
  const snapshot = async () => createHash('sha256').update(JSON.stringify(await p.phone.findMany({ select: { id: true, token: true }, orderBy: { id: 'asc' } }))).digest('hex');
  const before = await snapshot();
  const url = 'https://dashboard.jeblast.com/api/admin/device-webhook';
  const headers = { Authorization: 'Bearer ' + admin.token, 'Content-Type': 'application/json' };
  assert.equal((await fetch(url)).status, 401);
  let res = await fetch(url, { headers }); assert.equal(res.status, 200); assert.equal(res.headers.get('cache-control'), 'no-store');
  const body = await res.json(); assert.equal(body.settings.enabled, false); assert.equal(body.settings.secretConfigured, false); assert(!('secret' in body.settings));
  assert.equal((await fetch(url, { method: 'POST', headers, body: JSON.stringify({ action: 'test' }) })).status, 409);
  assert.equal((await fetch(url, { method: 'POST', headers, body: JSON.stringify({ enabled: true, url: 'http://localhost/hook' }) })).status, 400);
  const { encode } = require('next-auth/jwt');
  const jwt = await encode({ token: { id: admin.id, name: admin.name, email: admin.email }, secret: process.env.NEXTAUTH_SECRET });
  res = await fetch('https://dashboard.jeblast.com/dashboard/admin', { headers: { Cookie: '__Secure-next-auth.session-token=' + jwt } }); assert.equal(res.status, 200);
  const html = await res.text();
  const scripts = Array.from(html.matchAll(/src="([^"]*\/pages\/dashboard\/admin-[^"]+\.js)"/g));
  assert(scripts.length);
  for (const [, source] of scripts) {
    const js = await (await fetch(new URL(source, url))).text();
    assert(js.includes('Webhook Perangkat')); assert(js.includes('Webhook URL Kasir')); assert(js.includes('Tes Webhook Tersimpan'));
  }
  assert.equal(await snapshot(), before);
  assert.equal(await p.deviceWebhookEvent.count({ where: { status: { in: ['PENDING', 'SENDING'] } } }), 0);
  console.log('DEVICE_WEBHOOK_LIVE_OK: HTTPS admin settings/UI, auth, masked key, safe defaults, disabled test rejected, existing tokens unchanged');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => p.$disconnect());
