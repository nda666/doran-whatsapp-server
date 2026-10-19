const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const { encode } = require('next-auth/jwt');
const { captureChatMessage } = require('../dist/src/server/chat/store');
const { chatMediaDirectory, chatMediaPath } = require('../dist/src/server/chat/media');
const db = new PrismaClient();
const base = process.env.CHAT_TEST_BASE || 'https://dashboard.jeblast.com';
const createdUsers = [], createdPhones = [], createdFiles = [];
async function headers(user) {
  const jwt = await encode({ token: { id: user.id, sessionVersion: user.sessionVersion }, secret: process.env.NEXTAUTH_SECRET });
  return { Cookie: `__Secure-next-auth.session-token=${jwt}; next-auth.session-token=${jwt}`, Origin: new URL(process.env.NEXTAUTH_URL).origin, 'Content-Type': 'application/json' };
}
async function request(route, auth, method='GET', body) {
  const response=await fetch(base+route,{method,headers:auth,body:body ? JSON.stringify(body) : undefined,redirect:'manual'});
  return {code:response.status,data:await response.json().catch(()=>null),headers:response.headers};
}
(async()=>{
  const stamp=crypto.randomUUID();
  for(const suffix of ['a','b']) {
    const user=await db.user.create({data:{name:`Conversation test ${suffix}`,email:`chat-test-${stamp}-${suffix}@example.invalid`,password:crypto.randomBytes(32).toString('hex'),token:crypto.randomUUID(),approvalStatus:'APPROVED',isActive:true}});
    createdUsers.push(user);
    const phone=await db.phone.create({data:{userId:user.id,name:`Chat test ${suffix}`,active:0,saveIncomingMessages:false}});
    createdPhones.push(phone);
  }
  const [phone,otherPhone]=createdPhones, auth=await headers(createdUsers[0]), otherAuth=await headers(createdUsers[1]);
  const incoming={key:{id:crypto.randomUUID(),remoteJid:'628000000000@s.whatsapp.net',fromMe:false},message:{conversation:'Pesan uji percakapan'},pushName:'Customer Uji',messageTimestamp:Math.floor(Date.now()/1000)};
  await captureChatMessage(phone.id,incoming);
  assert.equal(await db.chatConversation.count({where:{phoneId:phone.id}}),0);
  // Enable only the disposable fixture directly, avoiding real device-change webhook deliveries.
  await db.phone.update({where:{id:phone.id},data:{saveIncomingMessages:true}});
  let res;
  const denied=await request('/api/phones',otherAuth,'POST',{id:phone.id,name:'Unauthorized',saveIncomingMessages:false});assert.equal(denied.code,404);
  await captureChatMessage(phone.id,incoming);await captureChatMessage(phone.id,incoming);
  const conversation=await db.chatConversation.findUniqueOrThrow({where:{phoneId_jid:{phoneId:phone.id,jid:incoming.key.remoteJid}}});
  assert.equal(conversation.unreadCount,1);assert.equal(await db.chatMessage.count({where:{conversationId:conversation.id}}),1);
  await captureChatMessage(phone.id,{...incoming,key:{...incoming.key,id:crypto.randomUUID(),fromMe:true},message:{conversation:'Balasan uji dari perangkat'}});
  assert.equal((await db.chatConversation.findUniqueOrThrow({where:{id:conversation.id}})).unreadCount,1);
  res=await request(`/api/conversations?phone_id=${phone.id}`,auth);assert.equal(res.code,200);assert.equal(res.data.total,1);
  assert.equal((await request(`/api/conversations?phone_id=${phone.id}`,otherAuth)).code,404);
  assert.equal((await request(`/api/conversations/${conversation.id}`,otherAuth)).code,404);
  assert.equal((await request(`/api/conversations?phone_id=${phone.id}`,{})).code,401);
  const text='File test';const mediaPath=`${crypto.randomUUID()}.bin`;createdFiles.push(mediaPath);
  await fs.mkdir(chatMediaDirectory(),{recursive:true});await fs.writeFile(chatMediaPath(mediaPath),text);
  const attachment=await db.chatMessage.create({data:{conversationId:conversation.id,waMessageId:crypto.randomUUID(),direction:'IN',type:'document',text:'Dokumen uji',status:'RECEIVED',mediaPath,mediaMime:'text/plain',mediaName:'test.txt'}});
  const ownMedia=await fetch(`${base}/api/conversations/media/${attachment.id}`,{headers:auth});assert.equal(ownMedia.status,200);assert.equal(await ownMedia.text(),text);
  assert.equal((await fetch(`${base}/api/conversations/media/${attachment.id}`,{headers:otherAuth})).status,404);
  const range=await fetch(`${base}/api/conversations/media/${attachment.id}`,{headers:{...auth,Range:'bytes=0-3'}});assert.equal(range.status,206);assert.equal(await range.text(),'File');
  await db.chatMessage.update({where:{id:attachment.id},data:{mediaMime:'image/png',mediaName:'test.png'}});
  const inline=await fetch(`${base}/api/conversations/media/${attachment.id}`,{headers:auth});assert.equal(inline.headers.get('Content-Disposition').startsWith('inline;'),true);
  const download=await fetch(`${base}/api/conversations/media/${attachment.id}?download=1`,{headers:auth});assert.equal(download.status,200);assert.equal(download.headers.get('Content-Disposition').startsWith('attachment;'),true);
  await db.chatMessage.update({where:{id:attachment.id},data:{mediaMime:'text/plain',mediaName:'test.txt'}});
  const messages=Array.from({length:65},(_,index)=>({conversationId:conversation.id,waMessageId:crypto.randomUUID(),direction:'IN',type:'text',text:`Pesan riwayat ${index}`,status:'RECEIVED',createdAt:new Date(Date.now()+index)}));
  await db.chatMessage.createMany({data:messages});
  res=await request(`/api/conversations/${conversation.id}`,auth);assert.equal(res.code,200);assert.equal(res.data.data.length,60);assert.equal(res.data.hasMore,true);assert.equal('mediaPath' in res.data.data[0],false);
  const before=await request(`/api/conversations/${conversation.id}?before=${res.data.data[0].id}`,auth);assert.equal(before.code,200);assert.equal(before.data.data.length,8);assert.equal(before.data.hasMore,false);
  const through=res.data.data.at(-1).id;
  assert.equal((await request(`/api/conversations/${conversation.id}`,auth,'PATCH',{action:'read',through})).code,200);
  assert.equal((await db.chatConversation.findUniqueOrThrow({where:{id:conversation.id}})).unreadCount,0);
  assert.equal((await request(`/api/conversations/${conversation.id}`,auth,'PATCH',{action:'archive',archived:true})).code,200);
  assert.equal((await request(`/api/conversations?phone_id=${phone.id}`,auth)).data.total,0);
  assert.equal((await request(`/api/conversations?phone_id=${phone.id}&archived=1`,auth)).data.total,1);
  await captureChatMessage(phone.id,{...incoming,key:{...incoming.key,id:crypto.randomUUID()}});
  assert.equal((await db.chatConversation.findUniqueOrThrow({where:{id:conversation.id}})).archived,false);
  const body={requestId:crypto.randomUUID(),text:'Do not send: disabled test device'};
  const typingBody={clientId:crypto.randomUUID(),typing:true};
  const typing=await request(`/api/conversations/${conversation.id}/typing`,auth,'POST',typingBody);
  assert.equal(typing.code,200);assert.equal(typing.data.active,false,'An inactive test device must not broadcast typing');
  assert.equal((await request(`/api/conversations/${conversation.id}/typing`,otherAuth,'POST',typingBody)).code,404);
  assert.equal((await request(`/api/conversations/${conversation.id}/typing`,auth,'POST',{clientId:typingBody.clientId,typing:'yes'})).code,400);
  assert.equal((await request(`/api/conversations/${conversation.id}/typing`,{},'POST',typingBody)).code,401);
  assert.equal((await request(`/api/conversations/${conversation.id}/send`,auth,'POST',body)).code,409);
  assert.equal((await request(`/api/conversations/${conversation.id}/send`,otherAuth,'POST',body)).code,404);
  assert.equal(await db.chatMessage.count({where:{clientRequestId:body.requestId}}),0);
  const page=await fetch(base+'/dashboard/conversations',{headers:auth});assert.equal(page.status,200);assert((await page.text()).includes('Percakapan'));
  assert.equal((await request(`/api/conversations/${conversation.id}`,{},'DELETE')).code,401);
  assert.equal((await request(`/api/conversations/${conversation.id}`,otherAuth,'DELETE')).code,404);
  assert.equal(await db.chatMessage.count({where:{conversationId:conversation.id}})>0,true);
  await db.chatMessage.update({where:{id:attachment.id},data:{status:'SENDING'}});
  assert.equal((await request(`/api/conversations/${conversation.id}`,auth,'DELETE')).code,409);
  assert.equal(await db.chatConversation.count({where:{id:conversation.id}}),1);
  await db.chatMessage.update({where:{id:attachment.id},data:{status:'RECEIVED'}});
  await db.chatConversation.update({where:{id:conversation.id},data:{archived:true}});
  assert.equal((await request(`/api/conversations/${conversation.id}`,auth,'DELETE')).code,200);
  assert.equal(await db.chatConversation.count({where:{id:conversation.id}}),0);
  assert.equal(await db.chatMessage.count({where:{conversationId:conversation.id}}),0);
  await assert.rejects(()=>fs.access(chatMediaPath(mediaPath)),{code:'ENOENT'});
  assert.equal((await request(`/api/conversations/${conversation.id}`,auth,'DELETE')).code,404);
  assert.equal((await fetch(`${base}/api/conversations/media/${attachment.id}`,{headers:auth})).status,404);
  await captureChatMessage(phone.id,{...incoming,key:{...incoming.key,id:crypto.randomUUID()}});
  const reopened=await db.chatConversation.findUniqueOrThrow({where:{phoneId_jid:{phoneId:phone.id,jid:incoming.key.remoteJid}}});
  assert.notEqual(reopened.id,conversation.id);
  assert.equal(await db.chatMessage.count({where:{conversationId:reopened.id}}),1);
  console.log('CONVERSATION_DELETE_LIVE_OK: authentication, ownership, sending guard, archived deletion, message cascade, media cleanup, repeat deletion and new incoming conversation');
  console.log('CONVERSATIONS_LIVE_OK: authenticated UI/API, capture flag, deduplication, outgoing sync, owner isolation, unread, archive, history pagination, protected file/range and offline-send rejection; no WhatsApp messages sent');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
  for(const phone of createdPhones) {
    await db.deviceWebhookEvent.deleteMany({where:{deviceId:phone.id}});
    await db.phone.deleteMany({where:{id:phone.id}});
  }
  for(const user of createdUsers) await db.user.deleteMany({where:{id:user.id}});
  for(const file of createdFiles) await fs.unlink(chatMediaPath(file)).catch(()=>{});
  if(createdPhones.length) assert.equal(await db.chatConversation.count({where:{phoneId:{in:createdPhones.map(p=>p.id)}}}),0);
  console.log('CONVERSATION_TEST_FIXTURES_REMOVED');
  await db.$disconnect();
});
