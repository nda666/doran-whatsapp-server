'use strict';
// Mock clocks/sockets/database; no real messages, database writes, or long waits.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ts=require('typescript'),{createRequire}=require('node:module');
process.env.DISPATCH_INTERVAL_MIN_MS='2000';process.env.DISPATCH_INTERVAL_MAX_MS='5000';
let random=0;
const mockMath=Object.create(Math);mockMath.random=()=>random;
let nextId=1;const timeouts=new Map(),intervals=new Map();
function load(name,stubs={},mockTimers=false){
  const file=path.resolve(__dirname,'..',name),module={exports:{}},real=createRequire(file);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:1,target:7,esModuleInterop:true}}).outputText;
  new Function('require','module','exports','Math','setTimeout','clearTimeout','setInterval','clearInterval',code)(
    n=>Object.hasOwn(stubs,n)?stubs[n]:real(n),module,module.exports,mockMath,
    mockTimers?(fn,ms)=>{const id=nextId++;timeouts.set(id,{fn,ms});return id}:setTimeout,
    mockTimers?id=>timeouts.delete(id):clearTimeout,
    mockTimers?(fn,ms)=>{const id=nextId++;intervals.set(id,{fn,ms});return id}:setInterval,
    mockTimers?id=>intervals.delete(id):clearInterval);
  return module.exports;
}
const constants=load('src/lib/dispatchSettings.ts'),timing=load('src/server/dispatch/timing.ts',{'../../lib/dispatchSettings':constants});
assert.equal(timing.randomDispatchDelay(),2000);random=0.999999;assert.equal(timing.randomDispatchDelay(),5000);
random=0.5;assert.equal(timing.randomDispatchDelay(),3500);
let releases=[],polls=0,failPoll=false,online=true;
const prisma={
 waSenderLease:{updateMany:async args=>{if(args.data.nextSendAt)releases.push(args.data.nextSendAt);return{count:1}}},
 phone:{findUnique:async()=>({active:1})},waDispatch:{findFirst:async()=>null},
 campaign:{updateMany:async()=>({count:0})},
 $executeRaw:async()=>1,
 $queryRaw:async parts=>{if(parts.join('').includes('JOIN wa_sender_leases')){polls++;if(failPoll)throw Object.assign(new Error('mock'),{code:'MOCK'})}return[]},
};
let delayRange={minSeconds:2,maxSeconds:5};
const settings={getDispatchAgeCutoff:async()=>new Date(0),getDispatchQueueOrder:async()=>'oldest',getDispatchDelayRange:async()=>({...delayRange}),dispatchDeadline:()=>({})};
const worker=load('src/server/dispatch/worker.ts',{
  '../libs/phoneMaintenance': { phoneMaintenance: new Set() }, './acknowledgement': { waitForDispatchAcknowledgement: (wait, id) => wait(id, 40000) }, './retry': load('src/server/dispatch/retry.ts'), './receipts': { recordDispatchReceipt: async () => {} },
 '../../lib/prisma':{prisma},'../../lib/dispatchSettings':constants,'./settings':settings,'./timing':timing,
 '../dispatchWebhook/events':{updateDispatches:async()=>({count:0})},
 '../libs/makeWASocket':{session:new Map([['phone',{ws:{get isOpen(){return online}},user:{id:'mock'}}]])},
 '@whiskeysockets/baileys':{},'./media':{},'../campaigns/media':{},'../campaigns/content':{},
},true);
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function fire(){const entry=[...timeouts].find(([,t])=>t.ms>=2000&&t.ms<=5000);assert(entry);timeouts.delete(entry[0]);entry[1].fn();await flush();}
(async()=>{
 random=0;let before=Date.now();await worker.processPhone('phone');assert(releases.at(-1)>=before+2000&&releases.at(-1)<=Date.now()+2000);
 random=0.999999;before=Date.now();await worker.processPhone('phone');assert(releases.at(-1)>=before+5000&&releases.at(-1)<=Date.now()+5000);
 online=false;before=Date.now();await worker.processPhone('phone');assert(releases.at(-1)>=before+30000);online=true;
 random=0;const stop=worker.startDispatchWorker();await flush();assert.equal(polls,0);assert.equal([...timeouts.values()][0].ms,2000);
 random=0.999999;await fire();assert.equal(polls,1);assert.equal([...timeouts.values()][0].ms,5000);
 failPoll=true;random=0.5;await fire();assert.equal(polls,2);assert.equal([...timeouts.values()][0].ms,3500);
 failPoll=false;delayRange={minSeconds:4,maxSeconds:4};await fire();assert.equal([...timeouts.values()][0].ms,4000);
 random=0;before=Date.now();await worker.processPhone('phone');assert(releases.at(-1)>=before+4000&&releases.at(-1)<=Date.now()+4000);
 await stop();assert.equal(timeouts.size,0);assert.equal(intervals.size,0);
 console.log('DISPATCH_RANDOM_DELAY_TESTS_PASSED: independent 2–5s device/poll delays, rerandomization, error recovery, offline cooldown and shutdown cleanup');
})().catch(e=>{console.error(e);process.exitCode=1});
