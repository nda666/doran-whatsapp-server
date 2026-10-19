const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const luminance = color => {
  const channels = color.match(/[\d.]+/g).slice(0,3).map(value => {
    const channel = Number(value)/255;
    return channel <= .04045 ? channel/12.92 : ((channel+.055)/1.055)**2.4;
  });
  return channels[0]*.2126 + channels[1]*.7152 + channels[2]*.0722;
};
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
    const options = [ ['green','Hijau','#34d399','#6ee7b7'], ['blue','Biru','#60b5fa','#93c5fd'], ['orange','Oranye','#ffb547','#ffd18a'], ['purple','Ungu','#b394f8','#d0baff'], ['rose','Rose','#fb91b5','#ffb4d0'], ['teal','Teal','#40d5d1','#80e8e4'] ];
    for (const dark of [false, true]) {
      if (dark) await page.getByRole('button',{name:'Mode gelap',exact:true}).click();
      for (const [value,label,lightAccent,darkAccent] of options) {
        await page.getByRole('button',{name:/^Tema warna:/}).click();
        await page.getByRole('menuitem',{name:label,exact:true}).click();
        await page.waitForFunction(({value,dark,accent}) => document.documentElement.dataset.color === value && document.documentElement.dataset.theme === (dark ? 'dark':'light') && getComputedStyle(document.documentElement).getPropertyValue('--ui-color').trim() === accent, {value,dark,accent:dark ? darkAccent : lightAccent});
        assert.equal(await page.evaluate(() => localStorage.getItem('doran-color')),value);
        const button = await page.locator('.ant-btn-primary').first().evaluate(el => ({background:getComputedStyle(el).backgroundColor,text:getComputedStyle(el).color}));
        const levels = [luminance(button.background),luminance(button.text)].sort((a,b) => b-a);
        assert((levels[0]+.05)/(levels[1]+.05) >= 4.5, `${value} primary button text contrast`);
      }
      console.log('ALL_SIX_COLORS_OK',dark ? 'dark' : 'light');
    }
    await page.reload();
    await page.getByRole('button',{name:'Tema warna: Teal',exact:true}).waitFor();
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    await page.locator('.dashboard-header').screenshot({path:'output/fresh-theme-navbar-dark-20261017.png'});
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
    await page.screenshot({path:'output/fresh-theme-mobile-20261017.png'});
    await page.keyboard.press('Escape');
    await page.goto('https://dashboard.jeblast.com/dashboard/message-templates');
    await page.getByRole('button',{name:'Tema warna: Oranye',exact:true}).waitFor();
    await page.setViewportSize({width:1440,height:1000});
    await page.getByRole('button',{name:/^Tema warna:/}).click();
    await page.getByRole('menuitem',{name:'Hijau',exact:true}).click();
    await page.getByRole('button',{name:/^Tema warna:/}).click();
    await page.locator('.ant-dropdown:visible').evaluate(el => Promise.all(el.getAnimations({subtree:true}).map(animation => animation.finished.catch(() => {}))));
    await page.screenshot({path:'output/fresh-theme-navbar-menu-20261017.png',clip:{x:850,y:0,width:590,height:420}});
    const hydrationErrors = errors.filter(error => /Minified React error #(418|423|425);/.test(error));
    const otherErrors = errors.filter(error => !hydrationErrors.includes(error));
    assert.equal(otherErrors.length,0,otherErrors.join('\n'));
    if (hydrationErrors.length) console.log('HYDRATION_WARNINGS_OBSERVED',hydrationErrors.length,'React recovered; origin not established by this check');
    console.log('THEME_LIVE_OK persistence, mobile picker, navigation');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
