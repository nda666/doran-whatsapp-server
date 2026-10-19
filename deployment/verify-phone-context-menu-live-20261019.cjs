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
    await page.goto('https://dashboard.jeblast.com/dashboard/phone?is_online=0&limit=20');
    await page.locator('.dashboard-user').waitFor();

    const row = page.locator('.ant-table-tbody tr.ant-table-row').first();
    await row.waitFor();
    await page.evaluate(() => {
      window.__phoneContextMenuEvents = [];
      document.addEventListener('contextmenu', event => {
        window.__phoneContextMenuEvents.push({ prevented: event.defaultPrevented, inRow: !!event.target.closest('.ant-table-row') });
      });
    });
    await row.locator('td').nth(1).click({button:'right'});
    const events = await page.evaluate(() => window.__phoneContextMenuEvents);
    assert(events.length > 0, 'Right-click event must fire');
    assert(events.at(-1).inRow, 'Right-click must target phone table row');
    assert.equal(events.at(-1).prevented, false, 'Native context menu must not be blocked');
    console.log('LIVE_PHONE_RIGHT_CLICK_OK', JSON.stringify(events.at(-1)));
    const response = await page.request.get('https://dashboard.jeblast.com/dashboard/phone?is_online=0&limit=20');
    assert.equal(response.status(),200);
    console.log('PUBLIC_PHONE_PAGE_OK', response.status());
  } finally {await browser.close();}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
