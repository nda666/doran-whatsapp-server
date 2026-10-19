const assert = require('node:assert/strict');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
(async () => {
  const owner = await db.user.findFirst({ where: { role: 'ADMIN' } });
  assert(owner);
  const { encode } = require('next-auth/jwt');
  const jwt = await encode({ token: { id: owner.id, token: owner.token, name: owner.name, email: owner.email }, secret: process.env.NEXTAUTH_SECRET });
  for (const page of ['phone', 'api-docs']) {
    const response = await fetch('https://dashboard.jeblast.com/dashboard/' + page, { redirect: 'manual', headers: { Cookie: '__Secure-next-auth.session-token=' + jwt } });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert(html.includes('Nama Akun WA'), page);
    if (page === 'phone') {
      assert(html.includes('Label / Nama Akun WA'));
      assert(html.includes('Cari label atau nama akun WA'));
      assert(!html.includes('Nama / Nama Akun WhatsApp'));
      assert(html.includes('>Label</'));
    } else {
      assert(html.includes('adalah Label perangkat'));
    }
    console.log('LIVE_LABELS_OK', page);
  }
})().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.$disconnect());
