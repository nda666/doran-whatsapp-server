const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const req = createRequire(process.cwd() + '/package.json');
req('@next/env').loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const db = new (req('@prisma/client').PrismaClient)();
const { encode } = req('next-auth/jwt');
const expected = ['/dashboard', '/dashboard/conversations', '/dashboard/phone', '/dashboard/campaigns', '/dashboard/calendar', '/dashboard/dispatch', '/dashboard/contacts', '/dashboard/message-templates', '/dashboard/media', '/dashboard/reports', '/dashboard/log', '/dashboard/ai-plugins', '/dashboard/api-docs'];
(async () => {
  const admin = await db.user.findUniqueOrThrow({ where: { email: 'admin@gmail.com' } });
  const regular = await db.user.findFirstOrThrow({ where: { role: 'USER', approvalStatus: 'APPROVED', isActive: true } });
  for (const [role, user] of [['admin', admin], ['user', regular]]) {
    const jwt = await encode({ token: { id: user.id, sessionVersion: user.sessionVersion }, secret: process.env.NEXTAUTH_SECRET });
    const headers = { Cookie: `__Secure-next-auth.session-token=${jwt}; next-auth.session-token=${jwt}` };
    for (const base of ['http://127.0.0.1:3000', 'https://dashboard.jeblast.com']) {
      const res = await fetch(base + '/dashboard/phone', { headers, redirect: 'manual', signal: AbortSignal.timeout(25000) });
      assert.equal(res.status, 200);
      const html = await res.text();
      const sidebar = html.match(/<aside\b[^>]*>[\s\S]*?<\/aside>/)?.[0];
      assert(sidebar, 'Rendered sidebar missing');
      assert(sidebar.includes('Doran WA'), 'Doran WA missing');
      assert(sidebar.includes('WhatsApp Server'), 'WhatsApp Server missing');
      assert(!sidebar.includes('JeBlast'), 'Old brand remains');
      assert(!sidebar.includes('WhatsApp Workspace'), 'Old subtitle remains');
      const links = [...new Set([...sidebar.matchAll(/href="(\/dashboard(?:\/[a-z-]+)?)"/g)].map(match => match[1]))];
      // Static pages load the authenticated session in the browser after hydration.
      assert.deepEqual(links, expected);
      assert.equal((sidebar.match(/ant-menu-item-divider/g) || []).length, 3);
      assert(sidebar.includes('ant-menu-item-selected'), 'Current page stays selected');
      const sessionRes = await fetch(base + '/api/auth/session', { headers, signal: AbortSignal.timeout(25000) });
      assert.equal(sessionRes.status, 200);
      const session = await sessionRes.json();
      assert.equal(session.user.id, user.id);
      assert.equal(session.user.role, user.role);
      {
        for (const route of ['/dashboard/admin', '/dashboard/plans']) {
          const denied = await fetch(base + route, { headers, redirect: 'manual', signal: AbortSignal.timeout(25000) });
          assert.equal(denied.status, role === 'user' ? 307 : 200);
        }
      }
      console.log('BRAND_RESTORE_OK', role, base);
    }
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
