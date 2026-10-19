'use strict';
// Read-only checks and schema-rejected synthetic requests; never enqueue a message.
const assert = require('node:assert/strict'), fs = require('node:fs');
const { randomUUID } = require('node:crypto');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const { encode } = require('next-auth/jwt');
const prisma = new PrismaClient();
const base = process.env.CAMPAIGN_TEST_BASE || 'https://dashboard.jeblast.com';
(async () => {
  const owner = await prisma.user.findFirst({ where: { role: 'ADMIN', isActive: true, approvalStatus: 'APPROVED' } });
  assert(owner, 'No active admin for read-only verification');
  const token = await encode({ token: { id: owner.id, token: owner.token, name: owner.name, email: owner.email, sessionVersion: owner.sessionVersion }, secret: process.env.NEXTAUTH_SECRET });
  const headers = { Cookie: `__Secure-next-auth.session-token=${token}; next-auth.session-token=${token}`, Origin: new URL(process.env.NEXTAUTH_URL).origin };
  const page = await fetch(base + '/dashboard/campaigns', { headers, redirect: 'manual' });
  assert.equal(page.status, 200);
  const html = await page.text();
  assert(html.includes('Kolom tambahan:'));
  const data = JSON.parse(html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)[1]);
  assert.equal(data.buildId, fs.readFileSync('.next/BUILD_ID', 'utf8').trim());
  const chunk = html.match(/src="([^"]*\/pages\/dashboard\/campaigns-[^"]+\.js)"/);
  assert(chunk);
  const asset = await fetch(new URL(chunk[1], base)); assert.equal(asset.status, 200);
  const js = await asset.text();
  for (const text of ['no_invoice', 'recipientCsv', 'Data penerima', 'kolom tambahan']) assert(js.includes(text), text);
  const template = await fetch(base + '/templates/campaign-personalisasi.csv');
  assert.equal(template.status, 200); assert((await template.text()).includes('nomor,nama,no_invoice,nominal,nama_produk'));
  const list = await fetch(base + '/api/campaigns?limit=1', { headers });
  assert.equal(list.status, 200); assert(Array.isArray((await list.json()).data));
  const invalid = await fetch(base + '/api/campaigns', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({
    id: randomUUID(), name: 'Schema rejection probe', message: '{nomor}', phoneIds: [randomUUID()], recipients: [{ number: '6281234567890', name: 'Synthetic', data: { nomor: 'forbidden' } }],
  }) });
  assert.equal(invalid.status, 400); assert((await invalid.json()).message.includes('Nama kolom tambahan tidak valid'));
  const { renderCampaignMessage, parseCampaignRows } = require('../dist/src/lib/campaignPersonalization.js');
  const rows = parseCampaignRows([['nomor', 'nama', 'no_invoice', 'nominal'], ['081234567890', 'Budi', 'INV-001', 'Rp 150.000']]);
  assert.equal(renderCampaignMessage('Halo {nama}: {no_invoice}, {nominal}', rows[0]), 'Halo Budi: INV-001, Rp 150.000');
  console.log('CAMPAIGN_PERSONALIZATION_LIVE_PASSED', JSON.stringify({ base, build: data.buildId, checks: ['authenticated page', 'campaign JS', 'CSV template', 'read-only API', 'schema rejection before enqueue', 'compiled personalization'] }));
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
