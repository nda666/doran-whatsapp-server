const assert = require('node:assert/strict');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const base = process.env.SUMMARY_BASE_URL || 'https://dashboard.jeblast.com';
(async () => {
  const admin = await db.user.findFirst({ where: { email: 'admin@gmail.com', role: 'ADMIN', approvalStatus: 'APPROVED' } });
  assert(admin);
  const users = [admin];
  const ordinary = await db.user.findFirst({ where: { role: 'USER', approvalStatus: 'APPROVED', isActive: true } });
  if (ordinary) users.push(ordinary);
  for (const user of users) {
    const headers = { Authorization: 'Bearer ' + user.token };
    const response = await fetch(base + '/api/phones?summary=1&page=99&is_online=0', { headers });
    assert.equal(response.status, 200);
    const summary = await response.json();
    const where = user.id === admin.id ? {} : { userId: user.id };
    const total = await db.phone.count({ where });
    const online = await db.phone.count({ where: { ...where, isOnline: true } });
    const active = await db.phone.count({ where: { ...where, active: 1 } });
    assert.deepEqual(summary, { total, online, offline: total-online, active, inactive: total-active });
  }
  assert.notEqual((await fetch(base + '/api/phones?summary=1')).status, 200);
  const { encode } = require('next-auth/jwt');
  const jwt = await encode({ token: { id: admin.id, token: admin.token, name: admin.name, email: admin.email, role: admin.role, approvalStatus: admin.approvalStatus, sessionVersion: admin.sessionVersion }, secret: process.env.NEXTAUTH_SECRET });
  const cookie = '__Secure-next-auth.session-token=' + jwt + '; next-auth.session-token=' + jwt;
  for (const [page, title, count] of [['phone', 'Ringkasan perangkat', 5], ['dispatch', 'Ringkasan pengiriman', 8]]) {
    const response = await fetch(base + '/dashboard/' + page, { headers: { Cookie: cookie } });
    assert.equal(response.status, 200);
    const html = await response.text();
    assert(html.includes(title));
    if (page === "dispatch") {
      const cards = html.match(/<article\b[\s\S]*?<\/article>/g);
      assert(cards && cards[0].includes('Total Data Antrean Pengiriman') && cards[0].includes('data-icon="database"'), "Total card is first");
    }
    if (page === "dispatch") { const cards = html.match(/<article\b[\s\S]*?<\/article>/g); assert(cards && cards[5].includes('data-icon="read"') && !cards[5].includes('data-icon="eye"'), "Read card uses an open book"); }
    if (page === "dispatch") { const cards = html.match(/<article\b[\s\S]*?<\/article>/g); assert(cards && cards[2].includes('data-icon="export"') && !cards[2].includes('data-icon="loading"'), "Sending card uses a static outgoing arrow"); }
    if (page === "dispatch") assert(html.indexOf("Ringkasan pengiriman") < html.indexOf("Status setiap penerima") && html.indexOf("Status setiap penerima") < html.indexOf(">Pencarian<"), "Dispatch summary, status information, search order");
    assert.equal((html.match(/<article\b/g) || []).length, count);
    const assets = [...html.matchAll(/(?:src|href)="([^" ]+\.(?:js|css)(?:\?[^" ]*)?)"/g)].map(m => m[1]);
    assert(assets.length);
    for (const url of assets) assert.equal((await fetch(new URL(url, base))).status, 200);
  }
  console.log('SUMMARY_CARDS_LIVE_OK: scoped counts, pagination independence, authentication, 5/8 cards, total dispatch card first and assets');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
