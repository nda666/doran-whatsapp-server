const assert = require('node:assert/strict');
const fs = require('node:fs'), { createHash } = require('node:crypto');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient(), base = 'https://dashboard.jeblast.com';
(async () => {
  const admin = await p.user.findUniqueOrThrow({ where: { email: 'admin@gmail.com' } });
  const { encode } = require('next-auth/jwt');
  const jwt = await encode({ token: { id: admin.id, token: admin.token, name: admin.name, email: admin.email }, secret: process.env.NEXTAUTH_SECRET });
  const response = await fetch(base + '/dashboard/api-docs', { headers: { Cookie: '__Secure-next-auth.session-token=' + jwt } });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert(html.includes('Download koleksi Postman'));
  assert(html.includes('Download environment Postman'));
  assert(html.includes('Download PDF cURL'));
  assert(html.includes('Contoh penerapan berbagai bahasa'));
  assert(html.includes('Dokumentasi diperbarui 11 Oktober 2026'));
  assert(html.includes('Cegah request ganda dengan job_id'));
  const data = JSON.parse(html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)[1]);
  assert.equal(data.buildId, fs.readFileSync('.next/BUILD_ID', 'utf8').trim());
  const chunk = html.match(/src="([^"]*\/pages\/dashboard\/api-docs-[^"]+\.js)"/);
  assert(chunk);
  const asset = await fetch(new URL(chunk[1], base)); assert.equal(asset.status, 200);
  const js = await asset.text();
  for (const word of ['JEBLAST_DEVICE_TOKEN', 'PHP cURL', 'JavaScript / Node.js', 'Python', 'Go']) assert(js.includes(word), word);
  for (const name of ['jeblast-api.postman_collection.json', 'jeblast-api.postman_environment.json', 'jeblast-api-curl-guide.pdf']) {
    const download = await fetch(base + '/downloads/' + name);
    assert.equal(download.status, 200);
    const body = Buffer.from(await download.arrayBuffer());
    const local = fs.readFileSync('public/downloads/' + name);
    assert.equal(createHash('sha256').update(body).digest('hex'), createHash('sha256').update(local).digest('hex'));
    if (name.endsWith('.pdf')) { assert(body.subarray(0, 5).toString() === '%PDF-'); assert(download.headers.get('content-type')?.includes('application/pdf')); }
    else { const obj = JSON.parse(body); if (obj.values) { assert(obj.values.filter(value => ['device_token','user_token','account_password'].includes(value.key)).every(value => value.value === '')); } else assert.equal(obj.item.flatMap(group => group.item).length, require('../src/data/apiDocumentation.json').postmanRequests); }
    console.log('API_TOOLKIT_PUBLIC_DOWNLOAD_HASH_OK', name, body.length);
  }
  console.log('API_TOOLKIT_LIVE_DOCS_AND_FIVE_LANGUAGES_OK', data.buildId);
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => p.$disconnect());
