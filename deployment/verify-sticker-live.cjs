'use strict';
// Upload a synthetic photo and remove it afterwards. Never enqueue/send a message.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const sharp = require('sharp');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const { encode } = require('next-auth/jwt');
const prisma = new PrismaClient();
const base = process.env.STICKER_TEST_BASE || 'https://dashboard.jeblast.com';
let assetId;
(async () => {
  const owner = await prisma.user.findFirst({ where: { email: 'admin@gmail.com', role: 'ADMIN', isActive: true, approvalStatus: 'APPROVED' } });
  assert(owner, 'No approved admin for deployment verification');
  const token = await encode({ token: { id: owner.id, token: owner.token, name: owner.name, email: owner.email, sessionVersion: owner.sessionVersion }, secret: process.env.NEXTAUTH_SECRET });
  const headers = { Cookie: `__Secure-next-auth.session-token=${token}; next-auth.session-token=${token}`, Origin: new URL(process.env.NEXTAUTH_URL).origin };
  const build = fs.readFileSync('.next/BUILD_ID', 'utf8').trim();
  const scripts = new Set();
  for (const route of ['/dashboard/phone', '/dashboard/campaigns', '/dashboard/media']) {
    const response = await fetch(base + route, { headers, redirect: 'manual' });
    assert.equal(response.status, 200, route);
    const html = await response.text();
    const data = JSON.parse(html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)[1]);
    assert.equal(data.buildId, build);
    for (const match of html.matchAll(/<script[^>]*src="([^"]+)"/g)) scripts.add(match[1]);
  }
  const chunks = await Promise.all([...scripts].map(async src => {
    const response = await fetch(new URL(src, base)); assert.equal(response.status, 200); return response.text();
  }));
  const js = chunks.join('\n');
  for (const text of ['Unggah foto menjadi stiker', 'Stiker / foto menjadi stiker', 'asSticker', 'Pratinjau stiker']) assert(js.includes(text), text);
  const phone = await prisma.phone.findFirst({ select: { id: true, userId: true } });
  const source = await sharp({ create: { width: 800, height: 400, channels: 3, background: 'green' } }).jpeg().toBuffer();
  const label = 'Deploy sticker verification ' + randomUUID();
  const form = new FormData();
  form.append('file', new Blob([source], { type: 'image/jpeg' }), 'deployment-probe.jpg');
  form.append('labels', JSON.stringify([label]));
  form.append('asSticker', '1');
  const upload = await fetch(base + '/api/media' + (phone ? '?phoneId=' + phone.id : ''), { method: 'POST', headers, body: form });
  assert.equal(upload.status, 201, 'photo upload');
  const asset = (await upload.json()).data[0]; assetId = asset.id;
  assert.equal(asset.mime, 'image/webp'); assert.ok(asset.size <= 102400);
  const row = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: assetId } });
  assert.equal(row.userId, phone ? phone.userId : owner.id);
  const preview = await fetch(base + '/api/media/' + assetId, { headers });
  assert.equal(preview.status, 200); assert.equal(preview.headers.get('content-type'), 'image/webp');
  const bytes = Buffer.from(await preview.arrayBuffer());
  const metadata = await sharp(bytes).metadata();
  assert.equal(metadata.width, 512); assert.equal(metadata.height, 512); assert.ok(bytes.length <= 102400);
  if (phone) {
    const list = await fetch(base + '/api/phones/' + phone.id + '/test-send', { headers });
    assert.equal(list.status, 200); assert((await list.json()).data.some(item => item.id === assetId), 'generated sticker appears in Test Kirim');
  }
  const { campaignInput, campaignJobs } = require('../dist/src/server/campaigns/prepare.js');
  const jobs = campaignJobs(campaignInput.parse({ id: randomUUID(), name: 'Synthetic', phoneIds: [randomUUID()], messageType: 'sticker', mediaId: assetId, recipients: [{ number: '081234567890', name: 'Test' }] }), row.userId, []);
  assert.deepEqual(jobs[0].payload, { kind: 'sticker' }); assert.equal(jobs[0].mediaId, assetId);
  const removed = await fetch(base + '/api/media/' + assetId, { method: 'DELETE', headers });
  assert.equal(removed.status, 200);
  assert.equal(await prisma.mediaAsset.count({ where: { id: assetId } }), 0);
  assetId = undefined;
  console.log('STICKER_LIVE_PASSED', JSON.stringify({ base, build, checks: ['authenticated pages/assets', 'photo upload/conversion', '512x512 WebP <=100KB', 'owner scoping', 'preview', 'Test Kirim media', 'compiled sticker payload', 'fixture cleanup'], whatsapp_sent: false }));
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  if (assetId) {
    const row = await prisma.mediaAsset.findUnique({ where: { id: assetId } });
    if (row && row.name.startsWith('Deploy sticker verification ')) {
      await prisma.mediaAsset.delete({ where: { id: assetId } });
      const { assetPath } = require('../dist/src/server/campaigns/media.js');
      await fs.promises.unlink(assetPath(row.filename)).catch(() => {});
    }
  }
  await prisma.$disconnect();
});
