const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createHash } = require('node:crypto');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
(async () => {
  const owner = await db.user.findFirst({ where: { role: 'ADMIN', email: 'admin@gmail.com' } });
  assert(owner);
  const base = 'https://dashboard.jeblast.com';
  const get = async path => {
    const res = await fetch(base + path, { headers: { Authorization: 'Bearer ' + owner.token } });
    assert.equal(res.status, 200); return res.json();
  };
  const rows = await get('/api/dispatch?job_id=c8f4cee8-ccb5-4148-b141-8e3bd4f4b479');
  assert.equal(rows.data.length, 1);
  assert.equal(rows.data[0].id, 'c8f4cee8-ccb5-4148-b141-8e3bd4f4b479');
  assert.equal(rows.data[0].job_id, '544b803a-3a8c-40a8-bc31-e29e19d0df59');
  const { encode } = require('next-auth/jwt');
  const jwt = await encode({ token: { id: owner.id, token: owner.token, name: owner.name, email: owner.email }, secret: process.env.NEXTAUTH_SECRET });
  for (const page of ['dispatch', 'api-docs']) {
    const res = await fetch(base + '/dashboard/' + page, { headers: { Cookie: '__Secure-next-auth.session-token=' + jwt } });
    assert.equal(res.status, 200);
    const html = await res.text();
    if (page === 'dispatch') {
      assert(html.includes('ID Pengiriman / Job ID Request'));
      const chunks = [...html.matchAll(/<script[^>]*src="([^"]+\.js)"/g)].map(match => match[1]);
      assert(chunks.length);
      const js = (await Promise.all(chunks.map(async chunk => {
        const asset = await fetch(new URL(chunk, base)); assert.equal(asset.status, 200);
        return asset.text();
      }))).join('\n');
      assert(js.includes('ID Pengiriman')); assert(js.includes('Job ID Request'));
    }
  }
  for (const name of ['jeblast-api.postman_collection.json', 'jeblast-api.postman_environment.json', 'jeblast-api-curl-guide.pdf']) {
    const res = await fetch(base + '/downloads/' + name); assert.equal(res.status, 200);
    const remote = Buffer.from(await res.arrayBuffer());
    const hash = bytes => createHash('sha256').update(bytes).digest('hex');
    assert.equal(hash(remote), hash(fs.readFileSync('public/downloads/' + name)));
  }
  assert(!fs.readFileSync('src/data/apiDocumentation.json', 'utf8').includes('UUID_JOB'));
  console.log('LIVE_IDENTIFIER_COLUMNS_API_MAPPING_AND_DOWNLOADS_OK');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
