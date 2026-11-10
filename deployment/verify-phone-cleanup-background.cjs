const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
function load(file,deps,globals={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,{exports,require:n=>n in deps?deps[n]:require(n),console,...globals});return exports;}
const options={disconnect:true,clearAuth:true,clearContacts:true,clearHistory:true,clearAutoReplies:true,resetToken:false,resetSettings:true,deleteRecord:false};
(async()=>{
const id='11111111-1111-4111-8111-111111111111',jobId='22222222-2222-4222-8222-222222222222';let job={id:jobId,pending:true},syncCalls=0,started=0;
const handler=load('src/pages/api/phones/[id].ts',{'@/lib/access':{phoneScope:()=>({userId:'owner'})},'@/middleware/apiAuthMiddleware':fn=>fn,'@/lib/phoneCleanup':load('src/lib/phoneCleanup.ts',{}),'@/server/cleanupPhone':{PhoneCleanupError:class extends Error{},cleanupPhone:async()=>{syncCalls++;return{result:true};}},'@/server/phoneCleanupJobs':{startPhoneCleanup:(phone,user,scope,input)=>{assert.equal(phone,id);assert.equal(user,'owner');assert.equal(scope.userId,'owner');assert.equal(input.resetToken,false);started++;return job;},phoneCleanupJob:(jid,phone,user)=>jid===jobId&&phone===id&&user==='owner'?job:undefined}}).default;
const req=(method,query={},user='owner')=>({method,query:{id,...query},user:{id:user},body:options});const res=()=>({code:200,setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;},end(){return this;}});
let r=res();await handler(req('POST',{background:'1'}),r);assert.equal(r.code,202);assert.equal(started,1);assert.equal(syncCalls,0);
r=res();await handler(req('GET',{jobId}),r);assert.equal(r.code,202);assert.equal(r.body.result,undefined);
r=res();await handler(req('GET',{jobId},'other'),r);assert.equal(r.code,409);
job={...job,pending:false,result:{result:true,deleted:true}};r=res();await handler(req('GET',{jobId}),r);assert.equal(r.body.deleted,true,'completion remains queryable after deleting device');
job={...job,error:{status:409,message:'busy'}};r=res();await handler(req('GET',{jobId}),r);assert.equal(r.code,409);assert.equal(r.body.message,'busy');
r=res();await handler(req('POST'),r);assert.equal(syncCalls,1,'legacy synchronous API stays compatible');
let polls=0,refreshes=0,fail=false;
class AxiosError extends Error{}
const axios={post:async(url,input)=>{assert.ok(url.endsWith('?background=1'));assert.equal(input.resetToken,false);return{data:{pending:true,jobId}};},get:async(url,config)=>{polls++;assert.equal(config.params.jobId,jobId);assert.equal(config.headers.Authorization,'Bearer token');assert.equal(refreshes,0,'no success/refetch before completion');if(fail)throw new AxiosError('disk failed');return{data:polls===1?{pending:true,jobId}:{result:true,deleted:false}};}};
let hookIndex=0;const hook=load('src/lib/usePhoneData.ts',{react:{useEffect(){},useState:value=>{const index=hookIndex++;return[value,()=>{if(index===0)refreshes++;}];}},axios:{...axios,default:axios,AxiosError,__esModule:true}},{setTimeout:fn=>{fn();}}).default;
const api=hook('token',{});let result=await api.deleteById(id,options);assert.equal(result.success,true);assert.equal(polls,2);assert.equal(refreshes,1);
refreshes=0;fail=true;result=await api.deleteById(id,options);assert.equal(result.success,false);assert.equal(result.error.message,'disk failed');assert.equal(refreshes,0);
console.log('PHONE_CLEANUP_BACKGROUND_OK: 202 admission/polling, owner-only status, deleted-device completion, legacy API, wait-until-complete UI and failure propagation');
})().catch(e=>{console.error(e);process.exitCode=1;});
