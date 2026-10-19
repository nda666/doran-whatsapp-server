const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {execFileSync,spawn}=require('node:child_process');
const {chromium}=require('C:/Users/nanan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const options=['-o','BatchMode=yes','-o','ConnectTimeout=15','-i',path.join(process.env.USERPROFILE,'.ssh/codex_wa_server_ed25519')];
const host='jeblast@103.196.146.186',preview=process.argv.includes('--preview'),base=preview?'http://127.0.0.1:43107':'https://dashboard.jeblast.com';
const locales=['id','en','es','ar','hi'];
const catalogs=Object.fromEntries(locales.map(l=>[l,JSON.parse(fs.readFileSync(path.join(__dirname,'../public/locales',l,'interface.json'),'utf8'))]));
const routes=['','/phone','/campaigns','/calendar','/dispatch','/contacts','/message-templates','/media','/reports','/log','/ai-plugins','/api-docs','/profile','/change-password','/search','/conversations'];
const testedRoutes=process.argv.includes('--smoke')?['/phone','/log','/dispatch']:routes;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  assert(preview,'Authenticated UI tests use only isolated static artifacts and a synthetic fixture session');
  let tunnel;if(preview){tunnel=spawn('ssh',[...options,'-N','-L','43107:127.0.0.1:3107','-L','43108:127.0.0.1:3108',host],{stdio:'ignore',windowsHide:true});await wait(1200);}
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  const report={base,routes:[],errors:[],untranslated:[],blockedWrites:[]};
  const save=()=>fs.writeFileSync(path.join(__dirname,'../tmp/localization/browser-'+(preview?'preview':'live')+'.json'),JSON.stringify(report,null,2));
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1000}});
    const assets=new Map();
    await context.route('**/_next/static/**',async route=>{const url=route.request().url();let asset=assets.get(url);if(!asset){asset=(async()=>{const response=await route.fetch();return {status:response.status(),headers:response.headers(),body:await response.body()};})();assets.set(url,asset);}await route.fulfill(await asset);});
    await context.route('**/api/**',async route=>{const request=route.request();if(!['GET','HEAD'].includes(request.method())){report.blockedWrites.push(new URL(request.url()).pathname);return route.abort();}return route.continue();});
    const page=await context.newPage();page.on('pageerror',error=>report.errors.push({url:page.url(),message:error.message}));
    for(const locale of process.argv.includes('--switch-only')?[]:locales){const prefix=locale==='id'?'':'/'+locale;for(const suffix of testedRoutes){
      const response=await page.goto(base+prefix+'/dashboard'+suffix,{waitUntil:'domcontentloaded',timeout:60000});assert(response?.ok(),`HTTP ${response?.status()} ${locale}${suffix}`);
      await page.locator('.dashboard-user').waitFor({timeout:20000});
      await page.waitForFunction(l=>document.documentElement.lang===l,locale);
      assert.equal(await page.locator('html').getAttribute('dir'),locale==='ar'?'rtl':'ltr');
      assert(await page.locator('.dashboard-page-title').innerText(),`Missing title: ${locale}${suffix}`);
      if(!suffix)await page.getByRole('heading',{name:catalogs[locale]['Ringkasan operasional'],exact:true}).waitFor();
      if(locale!=='id'){
        const candidates=Object.fromEntries(Object.entries(catalogs.id).filter(([source])=>catalogs[locale][source]!==source&&source.length>3&&source.length<300));
        const leftovers=await page.evaluate(candidates=>{const found=[];const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);for(let node;node=walker.nextNode();){const parent=node.parentElement,text=node.textContent.trim();if(!text||!parent||parent.closest('code,pre,script,style')||!parent.getClientRects().length)continue;if(Object.hasOwn(candidates,text))found.push(text);}return [...new Set(found)];},candidates);
        if(leftovers.length){report.untranslated.push({locale,route:suffix||'/',texts:leftovers});console.log('REVIEW_COPY',locale,suffix,JSON.stringify(leftovers));}
      }
      report.routes.push({locale,route:suffix||'/',status:response.status()});
      save();
    }console.log('BROWSER_ROUTES_OK',locale,testedRoutes.length);}
    // Change language with an unsaved form: preserve the user's input and the route/query.
    await page.goto(base+'/en/dashboard/profile?localization_check=1');
    const nameField=page.locator('input#name');await nameField.fill('Nama pelanggan — {nama} / 123');
    const select=page.getByRole('combobox',{name:'Language',exact:true});await select.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " ant-select ")]').click();await page.getByText('Español',{exact:true}).last().click();
    await page.waitForURL(/\/es\/dashboard\/profile\?localization_check=1/);
    assert.equal(await nameField.inputValue(),'Nama pelanggan — {nama} / 123');
    await page.waitForFunction(()=>document.cookie.split('; ').includes('NEXT_LOCALE=es'));
    assert((await context.cookies()).some(c=>c.name==='NEXT_LOCALE'&&c.value==='es'),'Selected locale cookie');
    await page.screenshot({path:path.join(__dirname,'../output/localization-spanish-form.png')});
    await page.goto(base+'/ar/dashboard');await page.getByRole('heading',{name:catalogs.ar['Ringkasan operasional'],exact:true}).waitFor();
    await page.setViewportSize({width:390,height:844});
    try { await page.waitForFunction(()=>document.querySelector('.dashboard-sidebar')?.getBoundingClientRect().width<=1&&parseFloat(getComputedStyle(document.querySelector('.dashboard-main')).marginInlineStart)===0,{},{timeout:5000}); }
    catch(error){console.log('MOBILE_STATE',JSON.stringify(await page.evaluate(()=>{const side=document.querySelector('.dashboard-sidebar'),main=document.querySelector('.dashboard-main');return {width:innerWidth,side:side.getBoundingClientRect().toJSON(),class:side.className,style:side.getAttribute('style'),main:main.getBoundingClientRect().toJSON(),margin:getComputedStyle(main).marginInlineStart,match:matchMedia('(max-width: 991.98px)').matches};})));throw error;}
    await page.locator('.dashboard-main').evaluate(el=>Promise.all(el.getAnimations({subtree:true}).filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));
    await page.screenshot({path:path.join(__dirname,'../output/localization-arabic-mobile.png')});
    const bounds=await page.getByRole('combobox',{name:catalogs.ar['Bahasa'],exact:true}).boundingBox();assert(bounds&&bounds.x>=0&&bounds.x+bounds.width<=391,'Language switcher outside mobile viewport');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2),false,'Mobile horizontal overflow');
    const guest=await browser.newContext();const login=await guest.newPage();for(const locale of locales){const prefix=locale==='id'?'':'/'+locale;await login.goto('http://127.0.0.1:43108'+prefix+'/signin');await login.getByRole('combobox',{name:catalogs[locale]['Bahasa'],exact:true}).waitFor();assert.equal(await login.locator('html').getAttribute('lang'),locale);}
    console.log('BROWSER_SWITCH_OK input, query, cookie, RTL mobile, guest language selector');
    fs.writeFileSync(path.join(__dirname,'../tmp/localization/browser-'+(preview?'preview':'live')+'.json'),JSON.stringify(report,null,2));
    assert.equal(report.blockedWrites.length,0,'Unexpected browser mutation requests');
    assert.equal(report.errors.length,0,JSON.stringify(report.errors));
    assert.equal(report.untranslated.length,0,JSON.stringify(report.untranslated));
    console.log('BROWSER_LOCALIZATION_OK',report.routes.length,'localized routes');
  }finally{save();await browser.close();if(tunnel)tunnel.kill();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});


