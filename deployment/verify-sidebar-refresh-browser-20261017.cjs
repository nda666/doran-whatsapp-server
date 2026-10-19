const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { chromium } = require('C:/Users/nanan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const remote = `
const req = require('node:module').createRequire('/home/jeblast/repos/doran-whatsapp-server/package.json');
req('@next/env').loadEnvConfig('/home/jeblast/repos/doran-whatsapp-server', false, {info(){},error(){}});
const db = new (req('@prisma/client').PrismaClient)();
(async () => {
  const admin = await db.user.findUniqueOrThrow({where:{email:'admin@gmail.com'}});
  const user = await db.user.findFirstOrThrow({where:{role:'USER',approvalStatus:'APPROVED',isActive:true}});
  const result = [];
  for (const [role, actor] of [['admin',admin], ['user',user]]) result.push({role, jwt: await req('next-auth/jwt').encode({token:{id:actor.id, email:actor.email, sessionVersion:actor.sessionVersion},secret:process.env.NEXTAUTH_SECRET,maxAge:300})});
  process.stdout.write(JSON.stringify(result));
})().finally(() => db.$disconnect());`;
const expected = ['/dashboard', '/dashboard/conversations', '/dashboard/phone', '/dashboard/campaigns', '/dashboard/calendar', '/dashboard/dispatch', '/dashboard/contacts', '/dashboard/message-templates', '/dashboard/media', '/dashboard/reports', '/dashboard/log', '/dashboard/ai-plugins', '/dashboard/api-docs'];
(async () => {
  const actors = JSON.parse(execFileSync('ssh', ['-o','BatchMode=yes','-o','ConnectTimeout=15','-i',path.join(process.env.USERPROFILE,'.ssh/codex_wa_server_ed25519'),'jeblast@103.196.146.186','/home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin/node','-'], { input:remote, encoding:'utf8', windowsHide:true }));
  const browser = await chromium.launch({ executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:true });
  try {
    for (const actor of actors) {
      const context = await browser.newContext({ viewport:{width:1440,height:1000} });
      await context.addCookies([{name:'__Secure-next-auth.session-token',value:actor.jwt,url:'https://dashboard.jeblast.com',secure:true}]);
      const page = await context.newPage();
      await page.goto('https://dashboard.jeblast.com/dashboard/phone');
      await page.locator('.dashboard-user').waitFor();
      const sidebar = page.locator('.dashboard-sidebar');
      const wanted = actor.role === 'admin' ? [...expected,'/dashboard/admin','/dashboard/plans'] : expected;
      await page.waitForFunction(count => document.querySelectorAll('.dashboard-sidebar .ant-menu-item a').length === count, wanted.length);
      assert.deepEqual(await sidebar.locator('.ant-menu-item a').evaluateAll(links => links.map(link => link.getAttribute('href'))), wanted);
      assert.equal(await sidebar.locator('.ant-menu-item-divider').count(), actor.role === 'admin' ? 4 : 3);
      await sidebar.screenshot({path:`output/sidebar-refresh-${actor.role}-20261017.png`});
      await page.getByRole('button',{name:'Tutup menu',exact:true}).click();
      await page.getByRole('button',{name:'Buka menu',exact:true}).waitFor();
      assert.equal(await sidebar.evaluate(el => el.classList.contains('ant-layout-sider-collapsed')), true);
      await page.setViewportSize({width:390,height:844});
      await page.getByRole('button',{name:'Buka menu',exact:true}).click();
      await sidebar.locator('a[href="/dashboard/message-templates"]').click();
      await page.waitForURL('**/dashboard/message-templates');
      await page.getByRole('button',{name:'Buka menu',exact:true}).waitFor();
      assert.equal(await page.locator('.sidebar-backdrop').count(), 0);
      console.log('SIDEBAR_BROWSER_OK',actor.role,'order, dividers, collapse, mobile navigation');
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode=1; });
