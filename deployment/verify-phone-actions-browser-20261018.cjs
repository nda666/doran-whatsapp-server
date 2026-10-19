// Read-only UI checks: no token generation or device changes.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { chromium } = require('C:/Users/nanan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const remote = `
const req=require('node:module').createRequire('/home/jeblast/repos/doran-whatsapp-server/package.json');
req('@next/env').loadEnvConfig('/home/jeblast/repos/doran-whatsapp-server',false,{info(){},error(){}});
const db=new(req('@prisma/client').PrismaClient)();
(async()=>{const actor=await db.user.findUniqueOrThrow({where:{email:'admin@gmail.com'}});
process.stdout.write(await req('next-auth/jwt').encode({token:{id:actor.id,email:actor.email,sessionVersion:actor.sessionVersion},secret:process.env.NEXTAUTH_SECRET,maxAge:300}));
})().finally(()=>db.$disconnect());`;
(async () => {
  const jwt = execFileSync('ssh', ['-o','BatchMode=yes','-o','ConnectTimeout=15','-i',path.join(process.env.USERPROFILE,'.ssh/codex_wa_server_ed25519'),'jeblast@103.196.146.186','/home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin/node','-'], {input:remote,encoding:'utf8',windowsHide:true}).trim();
  const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try {
    const context = await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
    await context.addCookies([{name:'__Secure-next-auth.session-token',value:jwt,url:'https://dashboard.jeblast.com',secure:true}]);
    const page = await context.newPage();
    await page.goto('https://dashboard.jeblast.com/dashboard/phone');
    await page.locator('.dashboard-user').waitFor();
    const ghost = page.locator('.phone-action-ghost').first();
    const disabled = page.locator('.phone-action-ghost:disabled');
    const appearance = locator => locator.evaluate(el => {
      const s = getComputedStyle(el);
      return {background:s.backgroundColor,color:s.color,border:s.borderColor,opacity:s.opacity,cursor:s.cursor};
    });
    for (const dark of [false,true]) {
      if (dark) await page.getByRole('button',{name:'Mode gelap',exact:true}).click();
      for (const [color,label] of [['blue','Biru'],['green','Hijau'],['orange','Oranye'],['purple','Ungu'],['rose','Rose'],['teal','Teal']]) {
        await page.getByRole('button',{name:/^Tema warna:/}).click();
        await page.getByRole('menuitem',{name:label,exact:true}).click();
        await page.waitForFunction(({color,dark})=>document.documentElement.dataset.color===color && document.documentElement.dataset.theme===(dark?'dark':'light'),{color,dark});
        await page.mouse.move(0,0);
        const sizes=await page.locator('.phone-actions .ant-btn').evaluateAll(elements=>elements.map(el=>{const s=getComputedStyle(el);return [s.height,s.paddingInlineStart,s.paddingInlineEnd,s.borderRadius];}));
        for (const size of sizes) assert.deepEqual(size,['40px','16px','16px','10px']);
        assert.equal(await page.locator('.phone-actions').evaluate(el=>getComputedStyle(el).gap),'12px');
        const before=await appearance(ghost);
        await ghost.hover();
        await ghost.evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{}))));
        const after=await appearance(ghost);
        assert.notEqual(after.background,before.background,'Ghost hover background');
        await page.mouse.move(0,0);
        const offBefore=await appearance(disabled);
        await disabled.hover({force:true});
        const offAfter=await appearance(disabled);
        assert.deepEqual(offAfter,offBefore,'Disabled hover must stay unchanged');
        assert.equal(offAfter.cursor,'not-allowed');
        assert.equal(offAfter.opacity,'0.45');
        const info=await page.locator('.phone-save-group-info').evaluate(el=>{const s=getComputedStyle(el);return {width:s.borderTopWidth,radius:s.borderRadius,color:s.borderColor};});
        assert.equal(info.width,'1px'); assert.equal(info.radius,'16px');
        assert.notEqual(info.color,'rgba(0, 0, 0, 0)');
        console.log('PHONE_ACTIONS_BROWSER_OK',dark?'dark':'light',color);
      }
    }
    await page.screenshot({path:'output/phone-actions-desktop-20261018.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});
    await page.getByRole('button',{name:'Mode terang',exact:true}).click();
    await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
    await page.reload();
    await page.locator('.dashboard-user').waitFor();
    await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');
    await page.mouse.move(0,0);
    await page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));
    const overflow=await page.locator('.phone-actions').evaluate(el=>el.scrollWidth>el.clientWidth);
    assert.equal(overflow,false,'Mobile action row overflow');
    const mobileSizes=await page.locator('.phone-actions .ant-btn').evaluateAll(elements=>elements.map(el=>getComputedStyle(el).height));
    assert(mobileSizes.every(height=>height==='40px'));
    await page.screenshot({path:'output/phone-actions-mobile-20261018.png',fullPage:true});
    console.log('PHONE_ACTIONS_MOBILE_OK');
  } finally {await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
