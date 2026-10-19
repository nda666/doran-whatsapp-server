const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const base = 'https://dashboard.jeblast.com';
const email = 'approval-live-' + randomUUID() + '@example.invalid';
const password = randomBytes(24).toString('hex');
async function login() {
  const csrf = await fetch(base + '/api/auth/csrf'); assert.equal(csrf.status, 200);
  const cookie = csrf.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  const { csrfToken } = await csrf.json();
  const response = await fetch(base + '/api/auth/callback/credentials', { method: 'POST', redirect: 'manual', headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrfToken, email, password, callbackUrl: base + '/dashboard', json: 'true' }) });
  return { status: response.status, body: await response.json(), cookies: response.headers.getSetCookie() };
}
(async () => {
  const signin = await fetch(base + '/signin'); assert.equal(signin.status, 200); assert((await signin.text()).includes('href="/signup"'));
  const signup = await fetch(base + '/signup', { redirect: 'manual' }); assert.equal(signup.status, 200); assert((await signup.text()).includes('persetujuan admin'));
  const create = await fetch(base + '/api/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Temporary approval live verification', email, password, passwordConfirm: password }) });
  assert.equal(create.status, 201); assert.equal((await create.json()).approvalStatus, 'PENDING');
  const user = await p.user.findUniqueOrThrow({ where: { email } });
  const pending = await login(); assert.equal(pending.status, 401); assert(new URL(pending.body.url).searchParams.get('error')?.includes('persetujuan admin')); assert(!pending.cookies.some(c => c.startsWith('__Secure-next-auth.session-token=')));
  const admin = await p.user.findUniqueOrThrow({ where: { email: 'admin@gmail.com' } });
  const approve = await fetch('http://127.0.0.1:3000/api/admin/users/' + user.id + '/approval', { method: 'PATCH', headers: { Authorization: 'Bearer ' + admin.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ approvalStatus: 'APPROVED' }) }); assert.equal(approve.status, 200);
  const approved = await login(); assert.equal(approved.status, 200); assert.equal(new URL(approved.body.url).pathname, '/dashboard');
  assert(approved.cookies.some(c => c.startsWith('__Secure-next-auth.session-token=')));
  const cookie = approved.cookies.map(c => c.split(';')[0]).join('; ');
  const session = await fetch(base + '/api/auth/session', { headers: { Cookie: cookie } }); assert.equal(session.status, 200); assert.equal((await session.json()).user.id, user.id);
  const devices = await fetch(base + '/api/phones', { headers: { Cookie: cookie } }); assert.equal(devices.status, 200); assert.deepEqual(await devices.json(), []);
  console.log('PUBLIC_LINK_SIGNUP_PENDING_CREDENTIAL_LOGIN_APPROVAL_SESSION_OWNER_SCOPE_OK');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  assert(email.startsWith('approval-live-') && email.endsWith('@example.invalid'));
  const result = await p.user.deleteMany({ where: { email } }); console.log('LIVE_SYNTHETIC_ACCOUNT_REMOVED', result.count); await p.$disconnect();
});
