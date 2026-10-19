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
      const icon = await page.locator('.dashboard-brand-icon').evaluate(el => ({bg:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color}));
      assert.equal(icon.bg, 'rgb(237, 248, 255)');
      assert.equal(icon.color, 'rgb(35, 139, 199)');
      const primary = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ui-color').trim());
      assert.equal(primary, '#83cefa');

      const wanted = actor.role === 'admin' ? [...expected,'/dashboard/admin','/dashboard/plans'] : expected;
      await page.waitForFunction(count => document.querySelectorAll('.dashboard-sidebar .ant-menu-item a').length === count, wanted.length);
      assert.deepEqual(await sidebar.locator('.ant-menu-item a').evaluateAll(links => links.map(link => link.getAttribute('href'))), wanted);
      assert.equal(await sidebar.locator('.ant-menu-item-divider').count(), actor.role === 'admin' ? 4 : 3);
      await sidebar.screenshot({path:`output/pastel-refresh-${actor.role}-20261017.png`});
      if (actor.role === 'admin') {
        await page.screenshot({path:'output/pastel-phone-desktop-20261017.png'});
        await page.goto('https://dashboard.jeblast.com/dashboard');
        await page.locator('.dashboard-user').waitFor();
        await page.waitForTimeout(1500);
        await page.screenshot({path:'output/pastel-dashboard-desktop-20261017.png',fullPage:true});
        await page.goto('https://dashboard.jeblast.com/dashboard/phone');
        await page.locator('.dashboard-user').waitFor();
      }

      await page.getByRole('button',{name:'Tutup menu',exact:true}).click();
      await page.getByRole('button',{name:'Buka menu',exact:true}).waitFor();
      assert.equal(await sidebar.evaluate(el => el.classList.contains('ant-layout-sider-collapsed')), true);
      await page.goto('https://dashboard.jeblast.com/dashboard');
      await page.locator('.dashboard-user').waitFor();
      await page.setViewportSize({width:390,height:844});
      await page.waitForTimeout(400);
      await page.screenshot({path:`output/pastel-mobile-${actor.role}-20261017.png`});
      await page.evaluate(() => localStorage.setItem('doran-dark','true'));
      await page.setViewportSize({width:1440,height:1000});
      await page.reload();
      await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
      const darkIcon = await page.locator('.dashboard-brand-icon').evaluate(el => getComputedStyle(el).color);
      assert.equal(darkIcon,'rgb(145, 209, 255)');
      console.log('PASTEL_BROWSER_OK',actor.role,'pastel tokens, icon, menu order, desktop collapse, mobile screenshot, dark icon');
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode=1; });
