const assert = require('node:assert/strict');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const { createHash } = require('node:crypto');
const digest = rows => createHash('sha256').update(JSON.stringify(rows)).digest('hex');
(async () => {
  const owner = await p.user.findFirstOrThrow({ where: { email: 'admin@gmail.com', role: 'ADMIN', approvalStatus: 'APPROVED' } });
  const snapshot = () => p.phone.findMany({ select: { id: true, token: true }, orderBy: { id: 'asc' } });
  const before = digest(await snapshot());
  const endpoint = 'https://dashboard.jeblast.com/api/phones/generate-token';
  let response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'all' }) });
  assert.equal(response.status, 401);
  response = await fetch(endpoint, { headers: { Authorization: 'Bearer ' + owner.token } });
  assert.equal(response.status, 405);
  for (const body of [{ scope: 'selected', ids: [] }, { scope: 'all', ids: [] }, { scope: 'selected', ids: ['00000000-0000-4000-8000-000000000000'] }]) {
    response = await fetch(endpoint, { method: 'POST', headers: { Authorization: 'Bearer ' + owner.token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(response.status, body.ids.length ? 409 : 400);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  const { encode } = require('next-auth/jwt');
  const jwt = await encode({ token: { id: owner.id, name: owner.name, email: owner.email }, secret: process.env.NEXTAUTH_SECRET });
  response = await fetch('https://dashboard.jeblast.com/dashboard/phone', { headers: { Cookie: '__Secure-next-auth.session-token=' + jwt } });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert(html.includes('Generate Token Terpilih')); assert(html.includes('Generate Token Semua Nomor'));
  assert(html.includes('ant-table-selection-column'));
  const scripts = Array.from(html.matchAll(/src="([^"]*\/pages\/dashboard\/phone-[^"]+\.js)"/g));
  assert(scripts.length);
  for (const [, url] of scripts) {
    const js = await (await fetch(new URL(url, 'https://dashboard.jeblast.com'))).text();
    assert(js.includes('preserveSelectedRowKeys')); assert(js.includes('generate-token')); assert(js.includes('Token lama'));
  }
  assert.equal(digest(await snapshot()), before, 'Existing device tokens must stay unchanged during verification');
  console.log('PHONE_TOKEN_LIVE_OK: HTTPS UI, selections, confirmation, authenticated rejection, no existing token rotated');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => p.$disconnect());
