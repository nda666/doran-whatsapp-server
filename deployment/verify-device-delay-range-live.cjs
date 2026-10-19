// Read policies and reject invalid ranges; no valid policy changes or messages.
const assert = require('node:assert/strict');
require('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const db = new (require('@prisma/client').PrismaClient)();
(async () => {
  const admin = await db.user.findFirstOrThrow({ where: { role: 'ADMIN', isActive: true } });
  const token = await require('next-auth/jwt').encode({ token: { id: admin.id, email: admin.email, sessionVersion: admin.sessionVersion }, secret: process.env.NEXTAUTH_SECRET, maxAge: 120 });
  const base = process.env.DEVICE_DELAY_RANGE_TEST_BASE || 'http://127.0.0.1:3000';
  const headers = { Cookie: '__Secure-next-auth.session-token=' + token + '; next-auth.session-token=' + token, Origin: new URL(process.env.NEXTAUTH_URL).origin, 'Content-Type': 'application/json' };
  const response = await fetch(base + '/api/device-policies', { headers });
  assert.equal(response.status, 200);
  const policies = await response.json(); assert(Array.isArray(policies));
  for (const policy of policies) assert('maxIntervalSeconds' in policy);
  const invalid = await fetch(base + '/api/device-policies', { method: 'PUT', headers, body: JSON.stringify({ phoneId: '00000000-0000-4000-8000-000000000001', useGlobalQuota: true, dailyLimit: 200, minIntervalSeconds: 5, maxIntervalSeconds: 2, adaptiveEnabled: true, paused: false }) });
  assert.equal(invalid.status, 400);
  const anonymous = await fetch(base + '/api/device-policies'); assert.equal(anonymous.status, 401);
  console.log('DEVICE_DELAY_LIVE_PASSED: authenticated policies include range, inverted range rejected, anonymous request rejected');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
