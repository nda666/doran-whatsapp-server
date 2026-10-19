const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { randomUUID } = require('node:crypto');
function clock() {
  let now=10000; const timers=new Set();
  return { Date:{now:()=>now}, setTimeout(fn,ms){const timer={fn,at:now+ms,unref(){}};timers.add(timer);return timer;},clearTimeout(timer){timers.delete(timer);},
    async advance(ms){now+=ms;for(const timer of [...timers])if(timer.at<=now){timers.delete(timer);await timer.fn();}await Promise.resolve();} };
}
function load(file,mocks={},fake=clock()) {
  const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText;
  const mod={exports:{}};
  new Function('require','module','exports','Date','setTimeout','clearTimeout','globalThis',source)(name=>name in mocks?mocks[name]:require(name),mod,mod.exports,fake.Date,fake.setTimeout,fake.clearTimeout,{});
  return mod.exports;
}
(async()=>{
  const time=clock(),events=[];
  const reporter=load('src/lib/chatTyping.ts',{},time).createChatTypingReporter(value=>events.push(value));
  reporter.input(true);assert.deepEqual(events,[true]);
  await time.advance(1000);reporter.input(true);assert.deepEqual(events,[true]);
  await time.advance(2500);reporter.input(true);assert.deepEqual(events,[true]);
  await time.advance(500);reporter.input(true);assert.deepEqual(events,[true,true],'Continuous typing refreshes after four seconds');
  await time.advance(3000);assert.deepEqual(events,[true,true,false],'Idle stops typing');
  reporter.stop();reporter.input(false);assert.equal(events.length,3);
  reporter.input(true);reporter.stop();assert.deepEqual(events.slice(-2),[true,false],'Blur/send/unmount stop immediately');
  reporter.input(true);reporter.input(false);assert.deepEqual(events.slice(-2),[true,false],'Clearing text stops typing');

  let found=true;const phone={id:'phone',showTyping:true,saveIncomingMessages:true,active:1};
  const presence=[],maintenance=new Set();
  const socket={user:{id:'self'},ws:{isOpen:true},sendPresenceUpdate:async(state,jid)=>presence.push([state,jid])};
  const serverClock=clock();
  const service=load('src/server/chat/typing.ts',{
    '../../lib/prisma':{prisma:{chatConversation:{findFirst:async({where})=>{assert.deepEqual(where.phone,{userId:'owner'});return found?{phone,jid:'628123@s.whatsapp.net'}:null;}}}},
    '../libs/makeWASocket':{session:new Map([['phone',socket]])},'../libs/phoneMaintenance':{phoneMaintenance:maintenance},
  },serverClock);
  const update=(client,typing)=>service.updateChatTyping('chat',{userId:'owner'},client,typing);
  found=false;assert.equal(await update('a',true),null);assert.equal(presence.length,0);found=true;
  phone.showTyping=false;assert.equal((await update('a',true)).active,false);assert.equal(presence.length,0);phone.showTyping=true;
  phone.saveIncomingMessages=false;assert.equal((await update('a',true)).active,false);phone.saveIncomingMessages=true;
  phone.active=0;assert.equal((await update('a',true)).active,false);phone.active=1;
  socket.ws.isOpen=false;assert.equal((await update('a',true)).active,false);socket.ws.isOpen=true;
  maintenance.add('phone');assert.equal((await update('a',true)).active,false);maintenance.clear();
  await update('a',true);assert.deepEqual(presence,[['composing','628123@s.whatsapp.net']]);
  await update('a',true);assert.equal(presence.length,1,'Frequent updates do not flood WhatsApp');
  await update('b',true);await update('a',false);assert.equal(presence.length,1,'One tab stopping cannot pause another active tab');
  await update('b',false);assert.deepEqual(presence.at(-1),['paused','628123@s.whatsapp.net']);
  await update('a',true);await serverClock.advance(8000);assert.deepEqual(presence.at(-1),['paused','628123@s.whatsapp.net'],'Lost stop requests expire on server');
  await update('a',true);phone.showTyping=false;await update('a',true);assert.equal(presence.at(-1)[0],'paused');

  const routeCalls=[];
  const route=load('src/pages/api/conversations/[id]/typing.ts',{
    '@/middleware/apiAuthMiddleware':{__esModule:true,default:fn=>fn},'@/lib/access':{ownerScope:user=>({userId:user.id})},
    '@/server/chat/typing':{updateChatTyping:async(...args)=>{routeCalls.push(args);return found?{active:false}:null;}},
  }).default;
  const id=randomUUID(),clientId=randomUUID();
  const request=async(method,body,query={id})=>{const res={code:200,status(n){this.code=n;return this;},setHeader(){},json(data){this.data=data;},end(){}};await route({method,query,body,user:{id:'owner'}},res);return res;};
  assert.equal((await request('GET')).code,405);
  assert.equal((await request('POST',{clientId,typing:'yes'})).code,400);
  assert.equal((await request('POST',{clientId,typing:true},{id:'invalid'})).code,400);
  assert.equal((await request('POST',{clientId,typing:true})).code,200);assert.deepEqual(routeCalls.at(-1),[id,{userId:'owner'},clientId,true]);
  found=false;assert.equal((await request('POST',{clientId,typing:false})).code,404);
  console.log('CHAT_TYPING_OK: draft events, throttled refresh, idle/clear/blur/send cleanup, server expiry, multiple tabs, device gates, owner scope and request validation; no messages sent');
})().catch(error=>{console.error(error);process.exitCode=1;});
