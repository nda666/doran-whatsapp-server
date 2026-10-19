// Authenticated reads and invalid input only; no messages or valid policy changes.
const assert = require('node:assert/strict');
require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const db = new (require('@prisma/client').PrismaClient)();
(async () => {
  const admin = await db.user.findFirstOrThrow({ where: { email: 'admin@gmail.com', role: 'ADMIN', isActive: true } });
  const token = await require('next-auth/jwt').encode({ token: { id: admin.id, email: admin.email, sessionVersion: admin.sessionVersion }, secret: process.env.NEXTAUTH_SECRET, maxAge: 120 });
  const base = process.env.WARMUP_TEST_BASE || 'http://127.0.0.1:3000';
  const headers = { Cookie: '__Secure-next-auth.session-token=' + token + '; next-auth.session-token=' + token, Origin: new URL(process.env.NEXTAUTH_URL).origin, 'Content-Type': 'application/json' };
  const response = await fetch(base + '/api/admin/global-settings', { headers });
  assert.equal(response.status, 200);
  const setting = (await response.json()).find(row => row.key === 'warmup-daily-limits');
  assert(setting && !setting.secret);
  const limits = setting.value.split(',').map(Number);
  assert(limits.length > 0 && limits.every((n, i) => Number.isInteger(n) && n > 0 && n <= 100000 && (!i || n > limits[i - 1])));
  const fields = await fetch(base + '/api/phones/form-fields', { headers });
  assert.equal(fields.status, 200);
  assert.deepEqual((await fields.json()).warmupLimits, limits);
  const policies = await fetch(base + '/api/device-policies', { headers });
  assert.equal(policies.status, 200);
  for (const policy of await policies.json()) {
    const maximum = policy.useGlobalQuota ? policy.globalQuota : policy.dailyLimit;
    const stage = policy.warmupStartedAt ? Math.max(0, Math.floor((Date.now() - new Date(policy.warmupStartedAt).getTime()) / 172800000)) : limits.length;
    assert.equal(policy.effectiveLimit, Math.min(maximum, limits[stage] ?? maximum));
  }
  const invalid = await fetch(base + '/api/admin/global-settings', { method: 'PATCH', headers, body: JSON.stringify({ id: setting.id, label: setting.label, value: '25,,50' }) });
  assert.equal(invalid.status, 400);
  const anonymous = await fetch(base + '/api/admin/global-settings');
  assert.equal(anonymous.status, 401);
  console.log('WARMUP_LIVE_PASSED: global comma input, form limits, effective policy limits, invalid input and anonymous access checks. Limits=' + setting.value);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
