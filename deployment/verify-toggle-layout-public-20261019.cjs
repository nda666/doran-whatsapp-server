const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const {chromium}=require('C:/Users/nanan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const remote="const req=require('node:module').createRequire('/home/jeblast/repos/doran-whatsapp-server/package.json');req('@next/env').loadEnvConfig('/home/jeblast/repos/doran-whatsapp-server',false,{info(){},error(){}});const db=new(req('@prisma/client').PrismaClient)();(async()=>{const u=await db.user.findUniqueOrThrow({where:{email:'admin@gmail.com'}});process.stdout.write(JSON.stringify({jwt:await req('next-auth/jwt').encode({token:{id:u.id,email:u.email,sessionVersion:u.sessionVersion},secret:process.env.NEXTAUTH_SECRET,maxAge:1200}),build:req('node:fs').readFileSync('/home/jeblast/repos/doran-whatsapp-server/.next/BUILD_ID','utf8').trim()}));})().finally(()=>db.$disconnect());";

(async()=>{
 const identity=JSON.parse(execFileSync('ssh',['-o','BatchMode=yes','-o','ConnectTimeout=15','-i',path.join(process.env.USERPROFILE,'.ssh/codex_wa_server_ed25519'),'jeblast@103.196.146.186','/home/jeblast/.local/share/doran-node/node-v24.21.0-linux-x64/bin/node','-'],{input:remote,encoding:'utf8',windowsHide:true}));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const report={build:identity.build,checks:[]};
 try {
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.addCookies([{name:'__Secure-next-auth.session-token',value:identity.jwt,url:'https://dashboard.jeblast.com',secure:true}]);
 const page=await context.newPage();
 await page.route('**/api/**',r=>['POST','PUT','PATCH','DELETE'].includes(r.request().method())?r.abort():r.continue());
 async function check(scope,name,plain=false){
  const rows=scope.locator('.device-setting-row:visible');await rows.first().waitFor();
  for(const width of [1440,390]){
   await page.setViewportSize({width,height:1000});
   const values=await rows.evaluateAll(rows=>rows.map(row=>{const toggle=row.querySelector('[role="switch"]'),label=row.querySelector('label'),state=row.querySelector('.device-setting-state');const a=toggle.getBoundingClientRect(),b=label.getBoundingClientRect(),c=state.getBoundingClientRect();return {x:a.x,statusX:c.x,labelX:b.x,rowX:row.getBoundingClientRect().x,overflow:row.scrollWidth>row.clientWidth,padding:getComputedStyle(row).paddingLeft,grid:getComputedStyle(row.querySelector('.device-setting-control')).display};}));
   assert(values.every(v=>v.x===values[0].x&&v.statusX===values[0].statusX&&!v.overflow&&v.grid==='grid'),name+' toggle alignment '+width);
   if(plain)assert(values.every(v=>v.padding==='0px'&&v.labelX===v.rowX),name+' label indentation');
   report.checks.push({name,width,rows:values.length});
  }
  await page.setViewportSize({width:1440,height:1000});
  console.log('PUBLIC_LAYOUT_OK',name);
 }
 await page.goto('https://dashboard.jeblast.com/dashboard/plans');
 assert.equal(await page.evaluate(()=>window.__NEXT_DATA__.buildId),identity.build);
 await page.getByRole('button',{name:'Tambah paket',exact:true}).click();
 let modal=page.locator('.ant-modal:visible');
 await check(modal,'Master paket',true);
 const labelX=await modal.locator('.device-setting-copy label').evaluate(el=>el.getBoundingClientRect().x);
 const descriptionX=await modal.locator('.ant-form-item-label').filter({hasText:'Deskripsi'}).evaluate(el=>el.getBoundingClientRect().x);
 assert(Math.abs(labelX-descriptionX)<1,'Paket label must align with input label');
 const sw=modal.getByRole('switch');const before=await sw.getAttribute('aria-checked');await modal.locator('.device-setting-copy label').click();assert.notEqual(await sw.getAttribute('aria-checked'),before);
 await modal.screenshot({path:'output/toggle-plans-public-20261019.png'});
 await page.goto('https://dashboard.jeblast.com/dashboard/admin');
 for(const name of ['Pesan dan notifikasi','Webhook Status Pengiriman','Webhook Perangkat']){
  await page.getByRole('tab',{name,exact:true}).click();
  await check(page.locator('.ant-tabs-tabpane-active'),name,true);
 }
 await page.getByRole('tab',{name:/Kelola pengguna|Manage Users/i}).click();
 await page.getByRole('button',{name:'Tambah Pengguna',exact:true}).click();
 await check(page.locator('.ant-modal:visible'),'Form pengguna',true);
 await page.goto('https://dashboard.jeblast.com/dashboard/phone');
 await page.getByRole('button',{name:'Tambahkan perangkat',exact:true}).click();
 modal=page.locator('.device-settings-modal:visible');
 await check(modal,'Form perangkat');
 const rows=modal.locator('.device-setting-row:visible');
 if(await rows.count()>1){await rows.first().getByRole('switch').click();await check(modal,'Form perangkat setelah toggle');}
 await modal.screenshot({path:'output/toggle-phone-public-20261019.png'});
 fs.writeFileSync('output/toggle-layout-public-verification-20261019.json',JSON.stringify(report,null,2));
 console.log('PUBLIC_DEPLOY_VERIFIED',identity.build);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
