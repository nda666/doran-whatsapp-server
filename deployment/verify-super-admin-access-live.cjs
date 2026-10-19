const assert = require('node:assert/strict');
require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const { PrismaClient } = require('@prisma/client');
const { encode } = require('next-auth/jwt');
const { randomUUID, randomBytes } = require('node:crypto');
const bcrypt = require('bcrypt');
const db = new PrismaClient();
const fixtures = [];
const publicBase = 'https://dashboard.jeblast.com';
const localBase = 'http://127.0.0.1:3000';
async function check(base, route, status, headers = {}, method = 'GET', body) {
  const res = await fetch(base + route, { method, headers, redirect: 'manual', signal: AbortSignal.timeout(20000), ...(body ? { body: JSON.stringify(body) } : {}) });
  assert.equal(res.status, status, `${base}${route} ${method}`);
  return res;
}
(async () => {
  const admin = await db.user.findUniqueOrThrow({ where: { email: 'admin@gmail.com' } });
  assert.equal(admin.role, 'ADMIN'); assert.equal(admin.approvalStatus, 'APPROVED');
  const users = await db.user.findMany({ where: { approvalStatus: 'APPROVED', email: { not: 'admin@gmail.com' } }, take: 1000 });
  async function fixture(role) {
    const email = 'access-check-' + randomUUID() + '@example.invalid';
    fixtures.push(email);
    return db.user.create({ data: { email, name: 'Temporary deployment access check', role, approvalStatus: 'APPROVED', deviceLimit: 0,
      token: randomUUID(), password: await bcrypt.hash(randomBytes(32).toString('hex'), 12) } });
  }
  const regular = users.find(user => user.role === 'USER') || await fixture('USER');
  const otherAdmin = users.find(user => user.role === 'ADMIN') || await fixture('ADMIN');
  const routes = ['users', 'plans', 'settings', 'update', 'dispatch-webhook', 'device-webhook', 'webhook-logs'];
  for (const base of [localBase, publicBase]) {
    for (const route of routes) await check(base, '/api/admin/' + route, 401);
    await check(base, '/api/bull-queue', 401);
    for (const actor of [regular, ...(otherAdmin ? [otherAdmin] : [])]) {
      const bearer = { Authorization: 'Bearer ' + actor.token, 'Content-Type': 'application/json' };
      for (const route of routes) {
        await check(base, '/api/admin/' + route, 403, bearer);
        await check(base, '/api/admin/' + route, 403, bearer, 'POST', {});
      }
      await check(base, '/api/admin/users/' + admin.id + '/approval', 403, bearer, 'PATCH', { approvalStatus: 'REJECTED' });
      await check(base, '/api/bull-queue', 403, bearer);
      await check(base, '/api/user', 403, bearer);
      await check(base, '/api/dispatch-webhook', 403, bearer, 'POST', {});
      const jwt = await encode({ token: { id: actor.id, email: 'admin@gmail.com', role: 'ADMIN' }, secret: process.env.NEXTAUTH_SECRET });
      const cookie = { Cookie: '__Secure-next-auth.session-token=' + jwt };
      for (const page of ['admin', 'plans']) {
        const res = await check(base, '/dashboard/' + page, 307, cookie);
        assert(new URL(res.headers.get('location'), base).pathname.endsWith('/dashboard'));
      }
      await check(base, '/dashboard/phone', 200, cookie);
      const phones = await (await check(base, '/api/phones', 200, bearer)).json();
      assert(phones.every(phone => phone.userId === actor.id), 'Device ownership leaked');
      // Cookie claims do not grant access without the designated database identity.
      await check(base, '/api/admin/users', 403, cookie);
    }
    const adminHeaders = { Authorization: 'Bearer ' + admin.token };
    for (const route of routes) await check(base, '/api/admin/' + route, 200, adminHeaders);
    await check(base, '/api/bull-queue', 503, adminHeaders);
    const jwt = await encode({ token: { id: admin.id }, secret: process.env.NEXTAUTH_SECRET });
    const cookie = { Cookie: '__Secure-next-auth.session-token=' + jwt };
    for (const page of ['admin', 'plans']) await check(base, '/dashboard/' + page, 200, cookie);
    console.log(base === localBase ? 'LOCAL_ACCESS_VERIFIED' : 'PUBLIC_ACCESS_VERIFIED');
  }
  console.log('SUPER_ADMIN_LIVE_ACCESS_OK: approved user denied; super admin allowed; direct pages; cookie and bearer; owner scope; no customer data changes');
  console.log(otherAdmin ? 'OTHER_ADMIN_DATABASE_ACCOUNT_VERIFIED' : 'OTHER_ADMIN_COVERED_BY_OFFLINE_REGRESSION');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  try {
    for (const email of fixtures) assert(email.startsWith('access-check-') && email.endsWith('@example.invalid'));
    if (fixtures.length) {
      const removed = await db.user.deleteMany({ where: { email: { in: fixtures } } });
      assert.equal(removed.count, fixtures.length); console.log('TEMPORARY_ACCESS_ACCOUNTS_REMOVED', removed.count);
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
  finally { await db.$disconnect(); }
});
