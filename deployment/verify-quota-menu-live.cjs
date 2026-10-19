// Isolated synthetic device only; no WhatsApp or email calls.
require('@next/env').loadEnvConfig(process.cwd());
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const { encode } = require('next-auth/jwt');
const { randomUUID } = require('node:crypto');
const db = new PrismaClient(), base = 'http://127.0.0.1:3000', phoneId = randomUUID();
(async () => {
  const admin = await db.user.findUniqueOrThrow({ where: { email: 'admin@gmail.com' } });
  const headers = { Authorization: 'Bearer ' + admin.token, 'Content-Type': 'application/json' };
  async function api(path, method = 'GET', body) {
    const res = await fetch(base + path, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, data: await res.json() };
  }
  const settings = await api('/api/admin/global-settings'); assert.equal(settings.status, 200);
  const quota = settings.data.find(r => r.key === 'device-daily-quota'); assert.equal(quota.value, '200');
  for (const value of ['0', '1.5', '100001', 'abc']) assert.equal((await api('/api/admin/global-settings', 'PATCH', { id: quota.id, label: quota.label, value })).status, 400);
  assert.equal(await db.deviceSendPolicy.count({ where: { OR: [{ dailyLimit: { not: 200 } }, { useGlobalQuota: false }] } }), 0);
  await db.phone.create({ data: { id: phoneId, name: 'Synthetic quota verification', userId: admin.id, active: 0 } });
  let read = await api('/api/device-policies');
  let row = read.data.find(r => r.id === phoneId); assert(row); assert.equal(row.effectiveLimit, 200); assert.equal(row.useGlobalQuota, true);
  const values = { phoneId, dailyLimit: 75, useGlobalQuota: false, minIntervalSeconds: null, adaptiveEnabled: true, paused: false };
  assert.equal((await api('/api/device-policies', 'PUT', values)).status, 200);
  row = (await api('/api/device-policies')).data.find(r => r.id === phoneId); assert.equal(row.effectiveLimit, 75);
  assert.equal((await api('/api/device-policies', 'PUT', { ...values, useGlobalQuota: true })).status, 200);
  row = (await api('/api/device-policies')).data.find(r => r.id === phoneId); assert.equal(row.effectiveLimit, 200); assert.equal(row.dailyLimit, 75);
  assert.equal((await api('/api/device-policies', 'PUT', { ...values, dailyLimit: 0 })).status, 400);
  const token = await encode({ token: { id: admin.id, email: admin.email, token: admin.token, sessionVersion: admin.sessionVersion }, secret: process.env.NEXTAUTH_SECRET });
  const cookies = { Cookie: '__Secure-next-auth.session-token=' + token };
  const contactPage = await fetch(base + '/dashboard/contacts', { headers: cookies }); assert.equal(contactPage.status, 200);
  const contactHtml = await contactPage.text(); assert(contactHtml.includes('Daftar blokir')); assert(!contactHtml.includes('href="/dashboard/messaging-settings"'));
  const adminPage = await fetch(base + '/dashboard/admin?tab=messaging-settings', { headers: cookies }); assert.equal(adminPage.status, 200);
  // Layout renders its session gate during SSR; tab contents hydrate in the browser.
  assert((await adminPage.text()).includes('ADMIN PANEL'));
  const old = await fetch(base + '/dashboard/messaging-settings', { headers: cookies, redirect: 'manual' }); assert.equal(old.status, 307); assert.equal(old.headers.get('location'), '/dashboard/admin?tab=messaging-settings');
  assert.equal((await fetch(base + '/api/device-policies')).status, 401);
  console.log('LIVE_QUOTA_MENU_OK: global 200, all policies initialized, custom/global API round trip, validation, admin/contact pages and old URL redirect.');
})().catch(e => { console.error(e.stack); process.exitCode = 1; }).finally(async () => {
  await db.deviceDailyUsage.deleteMany({ where: { phoneId } });
  await db.deviceSendPolicy.deleteMany({ where: { phoneId } });
  await db.phone.deleteMany({ where: { id: phoneId } });
  await db.$disconnect();
});
