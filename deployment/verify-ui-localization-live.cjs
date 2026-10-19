// Public, unauthenticated verification only. Never creates or extracts login sessions.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('C:/Users/nanan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const locales=['id','en','es','ar','hi'],base='https://dashboard.jeblast.com';
const report={pages:[],errors:[]};
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(e.message));
  for(const locale of locales){
   const prefix=locale==='id'?'':'/'+locale,catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'../public/locales',locale,'interface.json'),'utf8'));
   const response=await page.goto(base+prefix+'/signin',{waitUntil:'domcontentloaded'});assert(response?.ok());
   await page.getByRole('combobox',{name:catalog.Bahasa,exact:true}).waitFor();
   assert.equal(await page.locator('html').getAttribute('lang'),locale);
   assert.equal(await page.locator('html').getAttribute('dir'),locale==='ar'?'rtl':'ltr');
   await page.getByText(catalog.Masuk,{exact:true}).first().waitFor();
   report.pages.push({locale,status:response.status(),lang:locale});
   const restricted=await context.request.get(base+prefix+'/dashboard',{maxRedirects:0});
   assert([302,307,308].includes(restricted.status()));
   assert.equal(new URL(restricted.headers().location).pathname,prefix+'/signin','Preserve language on login redirect');
  }
  assert.equal(report.errors.length,0,JSON.stringify(report.errors));
  await page.goto(base+'/en/signin');
  await page.getByRole('combobox',{name:'Language',exact:true}).locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " ant-select ")]').click();
  await page.getByText('Español',{exact:true}).last().click();
  await page.waitForURL('**/es/signin');
  await page.waitForFunction(()=>document.cookie.split('; ').includes('NEXT_LOCALE=es'));
  await page.reload();
  assert.equal(await page.locator('html').getAttribute('lang'),'es');
  await page.screenshot({path:path.join(__dirname,'../output/localization-live-signin-spanish.png')});
  fs.writeFileSync(path.join(__dirname,'../tmp/localization/browser-public-live.json'),JSON.stringify(report,null,2));
  console.log('PUBLIC_LIVE_LOCALIZATION_OK five languages, HTML lang/dir, login redirects, persisted selection; zero page errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
