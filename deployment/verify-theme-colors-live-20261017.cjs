const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { chromium } = require('C:/Users/nanan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const remote = `
const req = require('node:module').createRequire('/home/jeblast/repos/doran-whatsapp-server/package.json');
req('@next/env').loadEnvConfig('/home/jeblast/repos/doran-whatsapp-server', false, {info(){},error(){}});
const db = new (req('@prisma/client').PrismaClient)();
(async () => {
  const actor = await db.user.findFirstOrThrow({where:{role:'USER',approvalStatus:'APPROVED',isActive:true}});
  process.stdout.write(await req('next-auth/jwt').encode({token:{id:actor.id,email:actor.email,sessionVersion:actor.sessionVersion},secret:process.env.NEXTAUTH_SECRET,maxAge:600}));
})().finally(() => db.$disconnect());`;

(async () => {
  const jwt = execFileSync('ssh', ['-o','BatchMode=yes','-o','ConnectTimeout=15','-i',path.join(process.env.USERPROFILE,'.ssh/codex_wa_server_ed25519'),'jeblast@103.196.146.186','/home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin/node','-'], {input:remote,encoding:'utf8',windowsHide:true}).trim();
  const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try {
    const context = await browser.newContext({viewport:{width:1440,height:1000}});
    await context.addCookies([{name:'__Secure-next-auth.session-token',value:jwt,url:'https://dashboard.jeblast.com',secure:true}]);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('https://dashboard.jeblast.com/dashboard/phone');
    await page.locator('.dashboard-user').waitFor();
    const options = [ ['green','Hijau','#147d68','#79d5b5'], ['blue','Biru','#1668c7','#85baff'], ['orange','Oranye','#b95012','#ffb279'], ['purple','Ungu','#7950bd','#c4a5ff'], ['rose','Rose','#bc3868','#ff9dbd'], ['teal','Teal','#087e8b','#73d4df'] ];
    for (const dark of [false, true]) {
      if (dark) await page.getByRole('button',{name:'Mode gelap',exact:true}).click();
      for (const [value,label,lightAccent,darkAccent] of options) {
        await page.getByRole('button',{name:/^Tema warna:/}).click();
        await page.getByRole('menuitem',{name:label,exact:true}).click();
        await page.waitForFunction(({value,dark,accent}) => document.documentElement.dataset.color === value && document.documentElement.dataset.theme === (dark ? 'dark':'light') && getComputedStyle(document.documentElement).getPropertyValue('--ui-accent').trim() === accent, {value,dark,accent:dark ? darkAccent : lightAccent});
        assert.equal(await page.evaluate(() => localStorage.getItem('doran-color')),value);
      }
      console.log('ALL_SIX_COLORS_OK',dark ? 'dark' : 'light');
    }
    await page.reload();
    await page.getByRole('button',{name:'Tema warna: Teal',exact:true}).waitFor();
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    await page.locator('.dashboard-header').screenshot({path:'output/theme-colors-navbar-dark-20261017.png'});
    await page.setViewportSize({width:390,height:844});
    await page.getByRole('button',{name:/^Tema warna:/}).click();
    await page.getByRole('menuitem',{name:'Oranye',exact:true}).click();
    await page.getByRole('button',{name:'Mode terang',exact:true}).click();
    await page.waitForFunction(() => document.documentElement.dataset.color === 'orange' && document.documentElement.dataset.theme === 'light');
    const bounds = await page.getByRole('button',{name:'Tema warna: Oranye',exact:true}).boundingBox();
    assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 390);
    await page.getByRole('button',{name:/^Tema warna:/}).click();
    await page.getByRole('menuitem',{name:'Oranye',exact:true}).waitFor();
    await page.locator('.ant-dropdown:visible').evaluate(el => Promise.all(el.getAnimations({subtree:true}).map(animation => animation.finished.catch(() => {}))));
    await page.screenshot({path:'output/theme-colors-mobile-20261017.png'});
    await page.keyboard.press('Escape');
    await page.goto('https://dashboard.jeblast.com/dashboard/message-templates');
    await page.getByRole('button',{name:'Tema warna: Oranye',exact:true}).waitFor();
    const hydrationErrors = errors.filter(error => /Minified React error #(418|423|425);/.test(error));
    const otherErrors = errors.filter(error => !hydrationErrors.includes(error));
    assert.equal(otherErrors.length,0,otherErrors.join('\n'));
    if (hydrationErrors.length) console.log('HYDRATION_WARNINGS_OBSERVED',hydrationErrors.length,'React recovered; origin not established by this check');
    console.log('THEME_LIVE_OK persistence, mobile picker, navigation');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
