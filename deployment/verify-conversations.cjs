const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const crypto = require('node:crypto');
function load(file, mocks, timers) {
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const mod = { exports: {} };
  new Function('require','module','exports','setTimeout','clearTimeout', source)(key => key in mocks ? mocks[key] : require(key), mod, mod.exports, timers || setTimeout, clearTimeout);
  return mod.exports;
}
const normalize = value => value?.ephemeralMessage?.message || value;
const content = load('src/server/chat/content.ts', { '@whiskeysockets/baileys': { normalizeMessageContent: normalize } });
const media = load('src/server/chat/media.ts', {});
const sample = (id = 'incoming-1', fromMe = false) => ({ key: { id, remoteJid: '628123@s.whatsapp.net', fromMe }, message: { conversation: 'Halo' }, pushName: 'Customer', messageTimestamp: Math.floor(Date.now()/1000) });
const phone = { id: 'phone', userId: 'owner', saveIncomingMessages: true, active: 1, showTyping: false };

async function persistence() {
  let since = null;
  let enabled = true, recheck = true, existing = false, inserts = 0, updates = [], removes = [], failCommit = false;
  const db = {
    phone: { findUnique: async () => enabled ? { ...phone, saveIncomingSince: since } : { ...phone, saveIncomingMessages: false } },
    chatMessage: { findFirst: async () => existing ? { id: 'saved' } : null, updateMany: async args => { updates.push(args); },
      createMany: async args => { inserts++; assert.equal(args.data[0].conversationId, 'chat'); return { count: 1 }; } },
    chatConversation: { upsert: async args => { assert.equal(args.where.phoneId_jid.phoneId,'phone'); return { id:'chat', lastMessageAt: new Date(0) }; }, update: async args => { updates.push(args); } },
    $queryRaw: async () => [],
    $transaction: async fn => { const value=await fn({ ...db, phone: { findUnique: async () => ({ ...phone, saveIncomingMessages: recheck }) } }); if(failCommit)throw Error('COMMIT_FAILED'); return value; },
  };
  const store = load('src/server/chat/store.ts', {
    '../../lib/prisma': { prisma: db }, './content': content, './media': media,
    '@whiskeysockets/baileys': { downloadContentFromMessage: async () => (async function* () { yield Buffer.from('file'); })() },
    'node:fs/promises': { mkdir: async()=>{}, writeFile:async()=>{}, unlink:async name=>{removes.push(name);} },
  });
  enabled=false; await store.captureChatMessage('phone', sample()); assert.equal(inserts,0);
  enabled=true; since=new Date(Date.now()+60000); await store.captureChatMessage('phone',sample()); assert.equal(inserts,0,'Messages before activation are skipped'); since=null; recheck=false; await store.captureChatMessage('phone',sample()); assert.equal(inserts,0);
  recheck=true; await store.captureChatMessage('phone',sample()); assert.equal(inserts,1); assert.deepEqual(updates.at(-1).data.unreadCount,{increment:1});
  await store.captureChatMessage('phone',{...sample('lid'),key:{...sample('lid').key,remoteJid:'100@lid',remoteJidAlt:'628123@s.whatsapp.net'}}); assert.equal(inserts,2); inserts=1;
  updates=[]; await store.captureChatMessage('phone',sample('out',true)); assert.equal(inserts,2); assert.equal(updates.at(-1).data.unreadCount,undefined);
  existing=true; await store.captureChatMessage('phone',sample()); assert.equal(inserts,2);
  updates=[]; await store.captureChatMessage('phone',sample('echo',true)); assert.equal(updates[0].data.status,'SENT');
  existing=false; const image={...sample('image'),message:{imageMessage:{mimetype:'image/png',fileLength:4}}};
  recheck=false; await store.captureChatMessage('phone',image); assert.equal(removes.length,1,'Discarded media cleaned up when disabled during capture');
  recheck=true; failCommit=true; await assert.rejects(()=>store.captureChatMessage('phone',image),/COMMIT_FAILED/); assert.equal(removes.length,2);
  updates=[]; await store.recordChatReceipt('phone','out',4); assert.equal(updates[0].data.status,'READ'); assert.equal(updates[0].where.status.in.includes('READ'),false);
  updates=[]; await store.recordChatReceipt('phone','out',2); assert.equal(updates[0].where.status.in.includes('DELIVERED'),false,'Late sent ACK cannot downgrade delivery');
}

async function sending() {
  let saved, sends=0, online=true, enabled=true, scopeOwner='owner', sendFails=false, flagChanges=false, serial=Promise.resolve();
  const socket={ user:{id:'628999@s.whatsapp.net'}, ws:{get isOpen(){return online;}}, sendMessage:async(jid,body,options)=>{
    sends++; assert.equal(jid,'628123@s.whatsapp.net'); assert.equal(options.messageId,saved.waMessageId); assert.equal(body.text,input.text,'Unicode emoji must reach WhatsApp transport unchanged'); if(sendFails)throw Error('NETWORK'); return {key:{id:options.messageId}};
  }};
  const db={
    phone:{findUnique:async()=>({...phone,saveIncomingMessages:flagChanges ? false : enabled})},
    chatConversation:{findFirst:async({where})=>where.userId && where.userId!==scopeOwner ? null : {id:'chat',jid:'628123@s.whatsapp.net',phone:{...phone,saveIncomingMessages:enabled}},update:async()=>{}},
    chatMessage:{findUnique:async()=>saved,create:async({data})=>(saved={id:'saved',...data}),updateMany:async({where,data})=>{if(where.status===saved.status)Object.assign(saved,data);},findUniqueOrThrow:async()=>saved},
    $queryRaw:async()=>[],
    $transaction:fn=>{const task=serial.then(()=>fn(db));serial=task.catch(()=>{});return task;},
  };
  const sender=load('src/server/chat/send.ts',{
    '../../lib/prisma':{prisma:db},'../libs/makeWASocket':{session:new Map([['phone',socket]])},'../libs/phoneMaintenance':{phoneMaintenance:new Set()},
    '../campaigns/media':{},'./media':media,'./content':content,'@whiskeysockets/baileys':{generateMessageIDV2:()=>crypto.randomUUID()},
  });
  const input={requestId:crypto.randomUUID(),text:'Terima kasih 😊🙏❤️ 📦'};
  await assert.rejects(()=>sender.sendChatReply('chat',{userId:'other'},input),e=>e.status===404);
  online=false; await assert.rejects(()=>sender.sendChatReply('chat',{userId:'owner'},input),e=>e.status===409); assert.equal(saved,undefined);
  online=true; enabled=false; await assert.rejects(()=>sender.sendChatReply('chat',{userId:'owner'},input),e=>e.status===409);
  enabled=true; const results=await Promise.all([sender.sendChatReply('chat',{userId:'owner'},input),sender.sendChatReply('chat',{userId:'owner'},input)]);
  assert.equal(sends,1); assert.equal(results[0].id,results[1].id); assert.equal(saved.status,'SENT'); assert.equal(saved.text,input.text,'Stored message must retain Unicode emoji');
  online=false; assert.equal((await sender.sendChatReply('chat',{userId:'owner'},input)).id,'saved','Lost-response retry returns previous send even while offline'); assert.equal(sends,1);
  await assert.rejects(()=>sender.sendChatReply('chat',{userId:'owner'},{...input,text:'Different'}),e=>e.status===409);
  saved=undefined;online=true;sendFails=true;await sender.sendChatReply('chat',{userId:'owner'},{...input,requestId:crypto.randomUUID()});assert.equal(saved.status,'UNCERTAIN');assert.equal(sends,2);
  await sender.sendChatReply('chat',{userId:'owner'},{...input,requestId:saved.clientRequestId});assert.equal(sends,2,'Ambiguous send never automatically resent');
  saved=undefined;sendFails=false;flagChanges=true;await assert.rejects(()=>sender.sendChatReply('chat',{userId:'owner'},{...input,requestId:crypto.randomUUID()}),e=>e.status===409);assert.equal(saved,undefined);
}

async function routes() {
  const id=crypto.randomUUID(); let found=true, lastWhere, writes=0;
  const db={
    phone:{findFirst:async args=>{lastWhere=args.where;return found?{...phone}:null;}},
    chatConversation:{findFirst:async args=>{lastWhere=args.where;return found?{id,phoneId:'phone',userId:'owner'}:null;},findMany:async()=>[],count:async()=>0,update:async()=>{writes++;}},
    chatMessage:{findFirst:async()=>null,findMany:async()=>[]},
  };
  const stubs={'@/middleware/apiAuthMiddleware':{__esModule:true,default:fn=>fn},'@/lib/prisma':{prisma:db},'@/lib/access':{ownerScope:user=>({userId:user.id})},'@/server/chat/public':load('src/server/chat/public.ts',{}),'@/server/chat/media':media};
  const list=load('src/pages/api/conversations/index.ts',stubs).default;
  const detail=load('src/pages/api/conversations/[id].ts',stubs).default;
  const request=async(handler,method,query,body)=>{const res={code:200,status(code){this.code=code;return this;},setHeader(){},json(value){this.value=value;return this;},end(){}};await handler({method,query,body,user:{id:'owner'}},res);return res;};
  assert.equal((await request(list,'GET',{})).code,400);
  assert.equal((await request(list,'GET',{phone_id:id})).code,200);assert.equal(lastWhere.userId,'owner');
  found=false;assert.equal((await request(list,'GET',{phone_id:id})).code,404);
  assert.equal((await request(detail,'GET',{id})).code,404);assert.equal(lastWhere.userId,'owner');assert.deepEqual(lastWhere.phone,{userId:'owner'});
  found=true;assert.equal((await request(detail,'PATCH',{id},{action:'read',through:id})).code,404);assert.equal(writes,0);
  assert.equal((await request(detail,'PATCH',{id},{action:'archive',archived:true})).code,200);assert.equal(writes,1);
  assert.equal((await request(detail,'GET',{id,before:'../invalid'})).code,400);
  const publicRow=stubs['@/server/chat/public'].publicChatMessage({id,mediaPath:'secret.bin',requestHash:'secret',sourceMediaId:'internal',text:'safe'});
  assert.equal('mediaPath' in publicRow,false);assert.equal('requestHash' in publicRow,false);assert.equal(publicRow.mediaUrl,`/api/conversations/media/${id}`);
}
(async()=>{
  for(const jid of ['628123@s.whatsapp.net','100@lid','123-456@g.us']) assert(content.chatJid(jid));
  for(const jid of ['status@broadcast','123@newsletter','../secret','@s.whatsapp.net']) assert.equal(content.chatJid(jid),false);
  assert.throws(()=>media.chatMediaPath('../outside'),/INVALID_CHAT_MEDIA/);
  assert.equal(content.chatContent(sample()).text,'Halo');
  assert.equal(content.chatContent({...sample(),message:{protocolMessage:{}}}),null);
  assert.equal(content.chatContent({...sample(),message:{viewOnceMessageV2:{message:{imageMessage:{}}}}}).media,null);
  assert.equal(content.chatContent({...sample(),message:{imageMessage:{caption:'Foto',mimetype:'image/png'}}}).type,'image');
  assert.equal(content.chatContent({...sample(),message:{ephemeralMessage:{message:{conversation:'wrapped'}}}}).text,'wrapped');
  await persistence();await sending();await routes();
  console.log('CONVERSATIONS_OK: capture gate, duplicates, unread, media cleanup, receipts, ownership, offline send, idempotency, ambiguous transport, validation and private media metadata');
})().catch(error=>{console.error(error);process.exitCode=1;});
