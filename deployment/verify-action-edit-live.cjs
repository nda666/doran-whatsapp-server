const assert = require('node:assert/strict');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
(async () => {
  const owner = await db.user.findFirst({ where: { role: 'ADMIN' } });
  assert(owner);
  const { encode } = require('next-auth/jwt');
  const jwt = await encode({ token: { id: owner.id, token: owner.token, name: owner.name, email: owner.email }, secret: process.env.NEXTAUTH_SECRET });
  for (const page of ['phone', 'auto-reply']) {
    const response = await fetch('https://dashboard.jeblast.com/dashboard/' + page, { redirect: 'manual', headers: { Cookie: '__Secure-next-auth.session-token=' + jwt } });
    assert.equal(response.status, 200);
    const html = await response.text();
    const data = JSON.parse(html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s)[1]);
    assert.equal(data.props.pageProps._nextI18Next.initialI18nStore.id.common.edit, 'Edit');
    assert(!html.includes('Sunting'));
    if (page === 'phone') {
      const src = html.match(/src="([^"\s]*pages\/dashboard\/phone-[^"\s]*\.js)"/)[1];
      const chunk = await fetch(new URL(src, 'https://dashboard.jeblast.com'));
      assert.equal(chunk.status, 200);
      const js = await chunk.text();
      assert(js.includes('Session Info'));
      const scripts = [...html.matchAll(/src="([^"\s]*\.js)"/g)].map(m => m[1]);
      const bundles = await Promise.all(scripts.map(async path => { const r = await fetch(new URL(path, 'https://dashboard.jeblast.com')); assert.equal(r.status, 200); return r.text(); }));
      assert(bundles.some(bundle => bundle.includes('info-circle')));
      const source = require('node:fs').readFileSync('src/components/phone/PhoneTableButton.tsx', 'utf8');
      assert(source.includes('label: "Session Info", icon: <InfoCircleOutlined />'));
    }
    console.log('LIVE_EDIT_AND_ICON_OK', page);
  }
})().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.$disconnect());
