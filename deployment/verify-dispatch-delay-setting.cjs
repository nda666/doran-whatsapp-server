const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const {createRequire}=require('node:module');
function load(name,stubs={}){const file=path.resolve(__dirname,'..',name),real=createRequire(file),module={exports:{}};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:1,target:7,esModuleInterop:true}}).outputText;new Function('require','module','exports',code)(n=>Object.hasOwn(stubs,n)?stubs[n]:real(n),module,module.exports);return module.exports;}
process.env.SETTINGS_ENCRYPTION_KEY='mock-delay-key';
const constants=load('src/lib/dispatchSettings.ts'),crypto=load('src/lib/globalSettings.ts');
let row=null;
const prisma={globalSetting:{findUnique:async()=>row,update:async({data})=>Object.assign(row,data),createMany:async()=>({count:0}),findMany:async()=>row?[row]:[]}};
const settings=load('src/server/dispatch/settings.ts',{'../../lib/prisma':{prisma},'../../lib/globalSettings':crypto,'../../lib/dispatchSettings':constants});
const api=load('src/pages/api/admin/global-settings.ts',{'@/lib/prisma':{prisma},'@/lib/globalSettings':crypto,'@/lib/dispatchSettings':constants,'@/middleware/apiSuperAdminMiddleware':fn=>fn}).default;
async function request(value){const res={code:200,setHeader(){},status(code){this.code=code;return this},json(body){this.body=body;return this}};await api({method:'PATCH',body:{id:row.id,label:row.label,value}},res);return res;}
(async()=>{
 assert.deepEqual(await settings.getDispatchDelayRange(),{minSeconds:2,maxSeconds:5});
 row={id:'22222222-2222-4222-8222-222222222222',key:constants.DISPATCH_DELAY_KEY,label:constants.DISPATCH_DELAY_LABEL,value:crypto.encryptSetting(JSON.stringify({minSeconds:2,maxSeconds:5}))};
 for(const value of ['bad','null','[]','{"minSeconds":0,"maxSeconds":5}','{"minSeconds":5,"maxSeconds":2}','{"minSeconds":2.5,"maxSeconds":5}','{"minSeconds":"2","maxSeconds":5}','{"minSeconds":1,"maxSeconds":31}','{"minSeconds":1}']){
  assert.equal(constants.parseDispatchDelayRange(value),null);assert.equal((await request(value)).code,400);
 }
 assert.equal((await request('{"minSeconds":3,"maxSeconds":7}')).code,200);assert.deepEqual(await settings.getDispatchDelayRange(),{minSeconds:3,maxSeconds:7});
 assert.equal((await request('{"minSeconds":4,"maxSeconds":4}')).code,200);assert.deepEqual(await settings.getDispatchDelayRange(),{minSeconds:4,maxSeconds:4});
 console.log('DISPATCH_DELAY_SETTING_TESTS_PASSED: encrypted atomic range, validation, defaults, equal bounds and reload without restart; no database or messages');
})().catch(e=>{console.error(e);process.exitCode=1});
