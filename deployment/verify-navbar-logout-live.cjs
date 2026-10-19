const assert = require('node:assert/strict');
const fs = require('node:fs');
require('@next/env').loadEnvConfig(process.cwd(), false);
const { PrismaClient } = require('@prisma/client');
const { encode } = require('next-auth/jwt');
const db = new PrismaClient(), base = 'https://dashboard.jeblast.com';
(async () => {
  const admin = await db.user.findUniqueOrThrow({ where: { email: 'admin@gmail.com' } });
  // Independent cookie jar: signing out this verification session does not change users' browser sessions.
  const jar = new Map();
  jar.set('__Secure-next-auth.session-token', await encode({ token: { id: admin.id, sessionVersion: admin.sessionVersion }, secret: process.env.NEXTAUTH_SECRET }));
  const cookie = () => [...jar].map(([key, value]) => key + '=' + value).join('; ');
  const ingest = response => { for (const item of response.headers.getSetCookie()) { const first = item.split(';')[0], index = first.indexOf('='); const key = first.slice(0, index), value = first.slice(index + 1); if (!value || /Max-Age=0/i.test(item)) jar.delete(key); else jar.set(key, value); } };
  let response = await fetch(base + '/api/auth/session', { headers: { Cookie: cookie() } }); assert.equal((await response.json()).user.id, admin.id); ingest(response);
  response = await fetch(base + '/api/auth/csrf', { headers: { Cookie: cookie() } }); const { csrfToken } = await response.json(); ingest(response);
  response = await fetch(base + '/api/auth/signout', { method: 'POST', headers: { Cookie: cookie(), Origin: base, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ csrfToken, callbackUrl: base + '/signin', json: 'true' }) });
  assert.equal(response.status, 200); assert.equal(new URL((await response.json()).url).pathname, '/signin'); ingest(response);
  assert(!jar.has('__Secure-next-auth.session-token'));
  response = await fetch(base + '/api/auth/session', { headers: { Cookie: cookie() } }); assert(!(await response.json()).user);
  response = await fetch(base + '/dashboard', { headers: { Cookie: cookie() }, redirect: 'manual' }); assert([302, 307].includes(response.status)); assert.equal(new URL(response.headers.get('location'), base).pathname, '/signin');
  const source = fs.readFileSync('src/components/Layout.tsx', 'utf8'); assert(source.includes('onClick: () => void logout()')); assert(!source.includes('href="/signout"'));
  console.log('NAVBAR_LOGOUT_LIVE_OK: independent authenticated session signed out via CSRF-protected POST, cookie removed, session empty, dashboard redirects to signin, navbar invokes logout directly.');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
