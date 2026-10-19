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
(async () => {
 const actors=JSON.parse(execFileSync('ssh',['-o','BatchMode=yes','-o','ConnectTimeout=15','-i',path.join(process.env.USERPROFILE,'.ssh/codex_wa_server_ed25519'),'jeblast@103.196.146.186','/home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin/node','-'],{input:remote,encoding:'utf8',windowsHide:true}));
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try {
  const context=await browser.newContext({viewport:{width:1440,height:1050}});
  await context.addCookies([{name:'__Secure-next-auth.session-token',value:actors[0].jwt,url:'https://dashboard.jeblast.com',secure:true}]);
  const page=await context.newPage();
  const writes=[];
  await page.route('**/api/**',async route => {
   if (['POST','PUT','PATCH','DELETE'].includes(route.request().method())) {
    writes.push({url:route.request().url(),data:route.request().postDataJSON()});
    await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'Preview validation: no changes saved'})});
   } else await route.continue();
  });
  await page.goto('https://dashboard.jeblast.com/en/dashboard/phone');
  await page.locator('.dashboard-user').waitFor();
  const action=page.locator('button[aria-label^="Device actions"], button[aria-label^="Aksi perangkat"]').first();
  // Action labels are localized; use the common table action button when needed.
  async function openItem(name) {
   const buttons=page.locator('.ant-table-tbody button').filter({has:page.locator('.anticon-down')});
   await buttons.first().click();
   
   await page.getByRole('menuitem',{name}).click();
  }
  const modal=page.locator('.device-settings-modal:visible');
  await openItem('Edit');
  await modal.locator('.device-setting-row:not([hidden])').first().waitFor();
  const rows=modal.locator('.device-setting-row:not([hidden])');
  assert(await rows.count()>=2);
  const first=rows.first();
  const toggle=first.getByRole('switch');
  const before=await toggle.getAttribute('aria-checked');
  await first.locator('label').click();
  assert.notEqual(await toggle.getAttribute('aria-checked'),before,'Label should toggle the setting');
  assert(await first.locator('.device-setting-state').innerText());
  await page.waitForTimeout(300);
  await modal.screenshot({path:'output/device-settings-edit-desktop-20261017.png'});
  await page.setViewportSize({width:390,height:844});
  await modal.screenshot({path:'output/device-settings-edit-mobile-20261017.png'});
  assert(await modal.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Modal horizontal overflow');
  await modal.getByRole('button',{name:'Save',exact:true}).click();
  await page.waitForTimeout(500);
  assert(writes.some(x=>x.url.endsWith('/api/phones')),'Edit submission was not captured');
  const edit=writes.find(x=>x.url.endsWith('/api/phones')).data;
  assert.equal(typeof edit.saveIncomingMessages,'boolean');
  await modal.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.locator('.ant-notification-notice-close').click();
  await page.waitForTimeout(300);
  await page.setViewportSize({width:1440,height:1050});
  await openItem('Set limits');
  await modal.locator('.device-setting-row').first().waitFor();
  const quota=modal.locator('#device-setting-useGlobalQuota');
  if(await quota.getAttribute('aria-checked')==='true') await quota.click();
  await modal.locator('input[role="spinbutton"]').first().waitFor();
  await modal.locator('input[role="spinbutton"]').first().fill('123');
  const follow=modal.locator('#device-setting-followGlobal');
  if(await follow.getAttribute('aria-checked')==='true') await follow.click();
  await modal.locator('input[role="spinbutton"]').nth(1).fill('20');
  await page.waitForTimeout(300);
  await modal.screenshot({path:'output/device-settings-limit-desktop-20261017.png'});
  await page.setViewportSize({width:390,height:844});
  await modal.screenshot({path:'output/device-settings-limit-mobile-20261017.png'});
  assert(await modal.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Policy modal horizontal overflow');
  await modal.getByRole('button',{name:'Save',exact:true}).click();
  await page.waitForTimeout(500);
  const policy=writes.find(x=>x.url.endsWith('/api/device-policies'))?.data;
  assert(policy,'Policy submission not captured');
  assert.equal(policy.dailyLimit,123);assert.equal(policy.minIntervalSeconds,20);assert.equal(policy.useGlobalQuota,false);
  await modal.getByRole('button',{name:'Cancel',exact:true}).click();
  console.log('SETTING_LAYOUT_BROWSER_OK labels, toggle state, conditional inputs, desktop/mobile layout, captured submissions; no writes reached server');
  await context.close();
 } finally {await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
