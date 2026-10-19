const assert = require('node:assert/strict');
const fs = require('node:fs');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const base = 'https://dashboard.jeblast.com';
(async () => {
  const phone = await p.phone.findFirst({ where: { number: { not: null }, user: { approvalStatus: 'APPROVED' } } });
  assert(phone);
  const owner = await p.user.findUniqueOrThrow({ where: { id: phone.userId } });
  const admin = owner.role === 'ADMIN' && owner.email?.trim().toLowerCase() === 'admin@gmail.com';
  const expectedAccess = { role: owner.role, scope: admin ? 'all' : 'own' };
  async function call(action, fields = {}, method = 'POST', token = phone.token) {
    const response = await fetch(base + '/api/public/' + action + (method === 'GET' ? '?' + new URLSearchParams(fields) : ''), {
      method, headers: { Authorization: 'Bearer ' + token, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
      ...(method === 'POST' ? { body: JSON.stringify(fields) } : {}),
    });
    return { response, body: response.status === 401 ? null : await response.json() };
  }
  const expected = await p.phone.findMany({ where: admin ? {} : { userId: phone.userId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
  for (const method of ['GET', 'POST']) {
    let result = await call('list-phones', {}, method);
    assert.equal(result.response.status, 200);
    assert.equal(result.response.headers.get('cache-control'), 'no-store');
    assert.equal(result.body.total, expected.length);
    assert.deepEqual(result.body.access, expectedAccess);
    assert.deepEqual(result.body.data.map(row => row.id), expected.map(row => row.id));
    for (const row of result.body.data) {
      assert.equal('token' in row, admin); if (admin) assert.equal(typeof row.token, 'string'); assert(!('qrCode' in row));
      if (admin) { assert(row.userId); assert.equal(row.user.id, row.userId); assert(!('token' in row.user)); assert(!('password' in row.user)); }
      else { assert(!('userId' in row)); assert(!('user' in row)); }
    }
    result = await call('phone-detail', { number: phone.number }, method);
    assert.equal(result.response.status, 200);
    assert(result.body.data.some(row => row.id === phone.id));
    assert(result.body.data.every(row => row.number === phone.number));
    assert.equal(result.body.total, expected.filter(row => row.number === phone.number).length);
    assert.deepEqual(result.body.access, expectedAccess);
    console.log('REGISTERED_PHONES_PUBLIC_HTTPS_OK', method, 'scope', expectedAccess.scope, 'devices', expected.length);
  }
  assert.equal((await call('phone-detail', { number: 'bad-number' })).response.status, 400);
  assert.equal((await call('phone-detail')).response.status, 400);
  assert.equal((await call('list-phones', {}, 'POST', 'invalid-token')).response.status, 401);
  const { encode } = require('next-auth/jwt');
  const jwt = await encode({ token: { id: owner.id, token: owner.token, name: owner.name, email: owner.email }, secret: process.env.NEXTAUTH_SECRET });
  const response = await fetch(base + '/dashboard/api-docs', { headers: { Cookie: '__Secure-next-auth.session-token=' + jwt } });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert(html.includes('Daftar nomor WhatsApp terdaftar &amp; detail nomor'));
  const data = JSON.parse(html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)[1]);
  assert.equal(data.buildId, fs.readFileSync('.next/BUILD_ID', 'utf8').trim());
  const chunk = html.match(/src="([^"]*\/pages\/dashboard\/api-docs-[^"]+\.js)"/);
  assert(chunk);
  const asset = await fetch(new URL(chunk[1], base));
  assert.equal(asset.status, 200);
  const js = await asset.text();
  assert(js.includes('/api/public/list-phones')); assert(js.includes('/api/public/phone-detail'));
  assert(js.includes('access.scope')); assert(js.includes('Token API disertakan sebagai field token'));
  console.log('REGISTERED_PHONES_API_DOCS_HTML_AND_JS_OK', data.buildId);
  console.log('REGISTERED_PHONES_LIVE_READ_ONLY_OK_NO_TEST_SEND');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => p.$disconnect());
