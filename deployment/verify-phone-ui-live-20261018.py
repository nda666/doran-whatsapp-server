"""Read-only checks of the deployed authenticated page and its public assets."""
from pathlib import Path
import subprocess
import sys

sys.stdout.reconfigure(encoding='utf-8')
remote = r"""
const assert = require('node:assert/strict');
const fs = require('node:fs');
const app = '/home/jeblast/repos/doran-whatsapp-server';
const req = require('node:module').createRequire(app + '/package.json');
req('@next/env').loadEnvConfig(app, false, {info(){},error(){}});
const db = new (req('@prisma/client').PrismaClient)();
(async () => {
 const actor = await db.user.findUniqueOrThrow({where:{email:'admin@gmail.com'}});
 const jwt = await req('next-auth/jwt').encode({token:{id:actor.id,email:actor.email,sessionVersion:actor.sessionVersion},secret:process.env.NEXTAUTH_SECRET,maxAge:300});
 const base = 'https://dashboard.jeblast.com';
 const response = await fetch(base + '/dashboard/phone', {redirect:'manual',headers:{Cookie:'__Secure-next-auth.session-token=' + jwt}});
 assert.equal(response.status,200,'Authenticated device page');
 const html = await response.text();
 for (const value of ['phone-actions','phone-action-primary','phone-action-secondary','Perangkat WhatsApp','Mode gelap','theme-toggle-label','dashboard-color-current']) assert(html.includes(value),'Missing page markup: ' + value);
 // The account menu is populated by useSession after hydration.
 const sessionResponse = await fetch(base + '/api/auth/session',{headers:{Cookie:'__Secure-next-auth.session-token=' + jwt}});
 assert.equal(sessionResponse.status,200,'Session endpoint');
 const session = await sessionResponse.json();
 assert.equal(session.user?.email,actor.email,'Authenticated account session');
 const build = fs.readFileSync(app + '/.next/BUILD_ID','utf8').trim();
 assert(html.includes('"buildId":"' + build + '"'),'Public page is serving another build');
 const urls = [...new Set([...html.matchAll(/href="([^\"]+\.css(?:\?[^\"]*)?)"/g)].map(match => match[1]))];
 assert(urls.length,'No CSS assets');
 let css = '';
 for (const url of urls) {
   const asset = await fetch(new URL(url,base));
   assert.equal(asset.status,200,'CSS asset unavailable');
   css += await asset.text();
 }
 for (const value of ['.phone-action-primary','.phone-action-secondary','color-mix(in srgb','border-radius:50%','.dashboard-user small','.theme-toggle-label']) assert(css.includes(value),'Missing production CSS: ' + value);
 const header = fs.readFileSync(app + '/src/components/Layout.tsx','utf8');
 assert(header.includes('<small>{session.user.email}</small>'),'Account email markup missing');
 assert(header.includes('session.user.name || uiText("Pengguna")'),'Account name markup missing');
 assert(header.includes('preferences.setColor(key)'),'Color picker handler missing');
 assert(header.includes('<LanguageSelect />'),'Language dropdown missing');
 assert(header.includes('width={248}'),'Sidebar width changed');
 const palette = req('node:fs').readFileSync(app + '/src/lib/dashboardColors.ts','utf8');
 for (const color of ['green','blue','orange','purple','rose','teal']) assert(palette.includes('value: "' + color + '"'),'Missing color: '+color);
 console.log('PUBLIC_AUTHENTICATED_PAGE_OK',response.status);
 console.log('PRODUCTION_CSS_ASSETS_OK',urls.length);
 console.log('COLOR_PICKER_LANGUAGE_SIDEBAR_SOURCE_OK');
 console.log('ACTIVE_BUILD',build);
})().catch(error => {console.error(error.message);process.exitCode=1;}).finally(() => db.$disconnect());
"""
result = subprocess.run(['ssh','-o','BatchMode=yes','-o','ConnectTimeout=15','-i',str(Path.home()/'.ssh/codex_wa_server_ed25519'),'jeblast@103.196.146.186','/home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin/node','-'], input=remote.encode(), stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
output = result.stdout.decode('utf-8',errors='replace')
print(output, end='')
(Path(__file__).resolve().parent/'phone-ui-verify-20261018.log').write_text(output,encoding='utf-8')
raise SystemExit(result.returncode)
