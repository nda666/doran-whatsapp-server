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
 const actors = JSON.parse(execFileSync('ssh', ['-o','BatchMode=yes','-o','ConnectTimeout=15','-i',path.join(process.env.USERPROFILE,'.ssh/codex_wa_server_ed25519'),'jeblast@103.196.146.186','/home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin/node','-'], {input:remote,encoding:'utf8',windowsHide:true}));
 const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try {
  const context = await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addCookies([{name:'__Secure-next-auth.session-token',value:actors[0].jwt,url:'https://dashboard.jeblast.com',secure:true}]);
  const page=await context.newPage();
  await page.goto('https://dashboard.jeblast.com/dashboard/phone');
  await page.locator('.dashboard-user').waitFor();
  const results=[];
  for (const dark of [false,true]) {
   if (dark) {
    await page.evaluate(() => localStorage.setItem('doran-dark','true'));
    await page.reload();
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
   }
   for (const [key,label] of [['blue','Biru'],['green','Hijau'],['orange','Oranye'],['purple','Ungu'],['rose','Rose'],['teal','Teal']]) {
    await page.locator('button[title="Tema warna"]').click();
    await page.getByRole('menuitem',{name:label,exact:true}).click();
    await page.waitForFunction(key => document.documentElement.dataset.color === key,key);
    const values=await page.locator('.dashboard-brand-icon').evaluate(el => {
     const style=getComputedStyle(el);
     const root=getComputedStyle(document.documentElement);
     const sample=document.createElement('span'); document.body.appendChild(sample);
     sample.style.color=root.getPropertyValue('--ui-accent');
     const expectedColor=getComputedStyle(sample).color;
     sample.style.color=root.getPropertyValue('--ui-selected');
     const expectedBg=getComputedStyle(sample).color;
     sample.remove();
     return {color:style.color,bg:style.backgroundColor,expectedColor,expectedBg};
    });
    assert.equal(values.color,values.expectedColor);
    assert.equal(values.bg,values.expectedBg);
    results.push(values.color);
    if (key==='orange' && !dark) await page.locator('.dashboard-brand').screenshot({path:'output/brand-theme-orange-20261017.png'});
    console.log('BRAND_THEME_BROWSER_OK',dark?'dark':'light',key);
   }
  }
  assert.equal(new Set(results).size,12,'All themes should have distinct icon colors');
  await context.close();
 } finally {await browser.close();}
})().catch(error => {console.error(error.message); process.exitCode=1;});
