'use strict';
// Use a disposable local database only. WhatsApp transport is mocked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createRequire } = require('node:module');
const { PrismaClient } = require('@prisma/client');
const { encode } = require('next-auth/jwt');
const prisma = new PrismaClient();
const base = process.env.UPGRADE_TEST_URL || 'http://127.0.0.1:3017';
process.env.DISPATCH_QUEUE_ENABLED='true'; process.env.WHATSAPP_ENABLED='false';
if (!/^mysql:\/\/[^/]*@127\.0\.0\.1:33179\/doran_upgrade_test\d*$/.test(process.env.DATABASE_URL || '')) throw new Error('Use the isolated local upgrade database on port 33179');
function load(relative, stubs = {}) {
  const file = path.join(__dirname, '..', 'dist', relative), real = createRequire(file), module = { exports: {} };
  new Function('require','module','exports',fs.readFileSync(file,'utf8'))(name => Object.hasOwn(stubs,name) ? stubs[name] : real(name),module,module.exports); return module.exports;
}
const users = [], phones = [], files = [];
async function cleanupQuery(run) {
  for(let attempt=0;;attempt++) {
    try { return await run(); } catch(e) {
      if(attempt>=2 || !String(e.message).includes('Record has changed since last read')) throw e;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
  }
}
let owner, outsider, campaign, media, snapshots;
let sends=0, inFlight=0, maxInFlight=0, missingAck=false;
const sockets = new Map();
const worker = load('src/server/dispatch/worker.js', {
  '../../lib/prisma': { prisma }, '../libs/makeWASocket': { session: sockets },
  '@whiskeysockets/baileys': { generateMessageIDV2: () => randomUUID() },
});
function socket() { return { ws:{isOpen:true}, user:{id:'mock@s.whatsapp.net'}, waitForMessage: async id => missingAck ? undefined : {tag:'ack',attrs:{id}}, sendPresenceUpdate: async()=>{},
  sendMessage: async (jid,content,options) => { assert.match(jid,/@s.whatsapp.net$/); assert(content.text || content.image || content.poll || content.forward); sends++; inFlight++; maxInFlight=Math.max(maxInFlight,inFlight); await new Promise(r=>setTimeout(r,30)); inFlight--; return {key:{id:options.messageId}}; } }; }
async function api(url, user=owner, method='GET', data, expected=200) {
  const response = await fetch(base+url,{method,headers:{Authorization:'Bearer '+user.token, ...(data ? {'Content-Type':'application/json'} : {})},body:data?JSON.stringify(data):undefined});
  const text=await response.text(); assert.equal(response.status,expected,`${method} ${url}: ${text.slice(0,300)}`); return text ? JSON.parse(text) : undefined;
}
(async()=>{
  owner=await prisma.user.create({data:{name:'Upgrade test',email:randomUUID()+'@example.invalid',password:'unused',token:randomUUID(),role:'ADMIN',deviceLimit:3}}); users.push(owner.id);
  outsider=await prisma.user.create({data:{name:'Other owner',email:randomUUID()+'@example.invalid',password:'unused',token:randomUUID()}}); users.push(outsider.id);
  for (const u of [owner,owner,owner,outsider]) { const p=await prisma.phone.create({data:{userId:u.id,name:'Synthetic '+phones.length}}); phones.push(p); if(u.id===owner.id) sockets.set(p.id,socket()); }
  const group=await api('/api/contacts/groups',owner,'POST',{name:'Pelanggan'});
  await api('/api/contacts',owner,'POST',{contacts:[{name:'Budi',number:'081234567890',groupId:group.id},{name:'Sari',number:'+628134567890',groupId:group.id}]});
  const list=await api('/api/contacts'); assert.equal(list.total,2);
  assert.equal((await api('/api/contacts',outsider)).total,0);
  await api('/api/contacts',outsider,'POST',{name:'Forbidden',number:'081234567890',groupId:group.id},400);
  const foreignGroup=await api('/api/contacts/groups',outsider,'POST',{name:'Private'});
  const form = new FormData(); form.append('file',new Blob([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1cAAAAASUVORK5CYII=','base64')],{type:'image/png'}),'test.png');
  const upload=await fetch(base+'/api/media',{method:'POST',headers:{Authorization:'Bearer '+owner.token},body:form}); assert.equal(upload.status,201); media=await upload.json();
  const storedMedia=await prisma.mediaAsset.findUniqueOrThrow({where:{id:media.id}}); files.push(path.join(process.cwd(),'storage','campaign-media',storedMedia.filename));
  assert.equal((await fetch(base+'/api/media/'+media.id,{headers:{Authorization:'Bearer '+outsider.token}})).status,404);
  const body={id:randomUUID(),name:'Test campaign',message:'Halo {nama}, {nomor}',phoneIds:[phones[0].id,phones[1].id],groupIds:[group.id],mediaId:media.id,delayMin:5,delayMax:7,recipients:[{number:'081234567890',name:'Budi'}]};
  campaign=await api('/api/campaigns',owner,'POST',body,201);
  await Promise.all(Array.from({length:8},()=>api('/api/campaigns',owner,'POST',body,201)));
  assert.equal(await prisma.waDispatch.count({where:{campaignId:campaign.id}}),2);
  await api('/api/campaigns',owner,'POST',{...body,message:'Different'},400);
  await api('/api/campaigns',owner,'POST',{...body,id:randomUUID(),phoneIds:[phones[3].id]},400);
  await api('/api/campaigns',owner,'POST',{...body,id:randomUUID(),groupIds:[foreignGroup.id]},400);
  await api('/api/campaigns/'+campaign.id,outsider,'PATCH',{action:'clear'},404);
  await api('/api/media/'+media.id,owner,'DELETE',undefined,409);
  const initial=await prisma.waDispatch.findMany({where:{campaignId:campaign.id}}); assert(initial.every(j=>j.message.includes(j.recipient)&&!j.message.includes('{nama}')));
  await api('/api/campaigns/'+campaign.id,owner,'PATCH',{action:'pause'});
  await Promise.all([worker.processPhone(phones[0].id),worker.processPhone(phones[1].id)]); assert.equal(sends,0);
  await prisma.waDispatch.updateMany({where:{campaignId:campaign.id},data:{expiresAt:new Date(0)}}); await worker.recoverDispatches();
  assert.equal(await prisma.waDispatch.count({where:{campaignId:campaign.id,status:'QUEUED'}}),2,'paused campaigns must not expire');
  await api('/api/campaigns/'+campaign.id,owner,'PATCH',{action:'resume'});
  await prisma.waSenderLease.updateMany({where:{phoneId:{in:phones.slice(0,2).map(p=>p.id)}},data:{nextSendAt:new Date(0)}});
  await Promise.all(Array.from({length:8},()=>worker.processPhone(phones[0].id))); assert.equal(sends,1); assert.equal(maxInFlight,1);
  const lease=await prisma.waSenderLease.findUniqueOrThrow({where:{phoneId:phones[0].id}}); assert(lease.nextSendAt.getTime()>Date.now()+3500,'campaign random delay applies');
  missingAck=true; await worker.processPhone(phones[1].id); assert.equal(sends,2);
  assert.equal(await prisma.waDispatch.count({where:{campaignId:campaign.id,status:'UNCERTAIN'}}),1);
  await worker.recoverDispatches(); assert.equal((await prisma.campaign.findUnique({where:{id:campaign.id}})).status,'COMPLETED');
  const future=await api('/api/campaigns',owner,'POST',{...body,id:randomUUID(),mediaId:null,scheduledAt:new Date(Date.now()+86400000).toISOString()},201);
  await prisma.waSenderLease.updateMany({where:{phoneId:{in:phones.slice(0,2).map(p=>p.id)}},data:{nextSendAt:new Date(0)}});
  await worker.processPhone(phones[0].id); assert.equal(sends,2,'future campaign must not send');
  await api('/api/campaigns/'+future.id,owner,'PATCH',{action:'clear'}); assert.equal(await prisma.waDispatch.count({where:{campaignId:future.id,status:'FAILED'}}),2);
  await api('/api/campaigns/'+future.id,owner,'PATCH',{action:'resume'}); assert.equal((await prisma.campaign.findUnique({where:{id:future.id}})).status,'CLEARED');
  await api('/api/phones',owner,'POST',{name:'Over limit'},409);
  const paginated=await api('/api/phones?page=1&limit=2'); assert.equal(paginated.total,3); assert.equal(paginated.data.length,2);
  await api('/api/phones',outsider,'POST',{id:phones[0].id,name:'Hijack'},404);
  await api('/api/admin/users',outsider,'GET',undefined,403);
  const adminUsers=await api('/api/admin/users'); assert(!adminUsers.data[0].password && !adminUsers.data[0].token);
  await api('/api/admin/users',owner,'POST',{id:owner.id,name:owner.name,email:owner.email,role:'USER',deviceLimit:3,plan:'Standard'},409);
  await api('/api/admin/settings',owner,'POST',{serverType:'VPS',nodeUrl:'http://127.0.0.1',nodePort:3017});
  await api('/api/admin/settings',owner,'POST',{action:'ssl',domain:'example.invalid',email:'test@example.invalid'},409);
  assert.deepEqual((await api('/api/admin/update')).pendingMigrations,[]);
  const orphan=await prisma.inboxMessage.create({data:{sender:'synthetic',recipient:'test'}});
  await api('/api/log',outsider); assert.equal((await prisma.inboxMessage.findUnique({where:{id:orphan.id}})).userId,null); await prisma.inboxMessage.delete({where:{id:orphan.id}});
  const stats=await api('/api/dashboard-stats?days=7'); assert.equal(stats.devices,3); assert.equal(stats.counts.SENT,1); assert.equal((await api('/api/dashboard-stats',outsider)).counts.SENT,undefined);
  const today=new Date(Date.now()+7*3600000).toISOString().slice(0,10);
  assert((await api(`/api/reports?start=${today}&end=${today}`)).total>=4);
  assert.equal((await api('/api/search?q=Test%20campaign',outsider)).data.length,0);
  assert((await api('/api/search?q=Test%20campaign')).data.length);
  await prisma.deviceContact.create({data:{userId:owner.id,phoneId:phones[0].id,number:'628144567890',name:'Sync contact'}});
  await api('/api/contacts/sync',owner,'POST',{phoneId:phones[0].id,groupId:group.id}); assert.equal((await api('/api/contacts')).total,3);
  const { campaignInput,campaignJobs }=require('../dist/src/server/campaigns/prepare');
  assert(!campaignInput.safeParse({...body,delayMin:10,delayMax:1}).success);
  assert.throws(()=>campaignJobs(campaignInput.parse({...body,recipients:[{number:'bad',name:''}],groupIds:[]}),owner.id,[]),/Nomor/);
  const book=await api('/api/contacts');
  const individual=await api('/api/campaigns',owner,'POST',{...body,id:randomUUID(),mediaId:null,groupIds:[],recipients:[],contactIds:[book.data[0].id],scheduledAt:new Date(Date.now()+86400000).toISOString()},201);
  assert.equal(await prisma.waDispatch.count({where:{campaignId:individual.id}}),1);
  const allBook=await api('/api/campaigns',owner,'POST',{...body,id:randomUUID(),mediaId:null,groupIds:[],recipients:[],allContacts:true,scheduledAt:new Date(Date.now()+86400000).toISOString()},201);
  assert.equal(await prisma.waDispatch.count({where:{campaignId:allBook.id}}),3);
  await api('/api/campaigns',outsider,'POST',{...body,id:randomUUID(),phoneIds:[phones[3].id],groupIds:[],recipients:[],contactIds:[book.data[0].id],mediaId:null},400);
  const { payloadContent }=require('../dist/src/server/campaigns/content');
  assert(payloadContent({kind:'poll',name:'Pilih',values:['A','B'],selectableCount:1}).poll);
  assert(payloadContent({kind:'button',text:'Test',buttons:[{id:'a',text:'A'}]}).forward.message.buttonsMessage);
  assert(payloadContent({kind:'list',text:'Test',title:'Menu',buttonText:'Pilih',rows:[{id:'a',title:'A'}]}).forward.message.listMessage);
  assert.throws(()=>payloadContent({kind:'poll',name:'Pilih',values:['A','A'],selectableCount:1}),/INVALID_POLL/);
  const baileys=require('@whiskeysockets/baileys');
  const button=await baileys.generateWAMessageContent(payloadContent({kind:'button',text:'Test',buttons:[{id:'a',text:'A'}]}),{});
  assert.equal(button.buttonsMessage.buttons[0].buttonId,'a');
  const menu=await baileys.generateWAMessageContent(payloadContent({kind:'list',text:'Test',title:'Menu',buttonText:'Pilih',rows:[{id:'a',title:'A'}]}),{});
  assert.equal(menu.listMessage.sections[0].rows[0].rowId,'a');
  const publicApi=load('src/pages/api/public/[action].js',{
    '@/lib/prisma':{prisma}, '@/server/dispatch/queue':load('src/server/dispatch/queue.js',{'../../lib/prisma':{prisma}}),
    '@/server/campaigns/content':require('../dist/src/server/campaigns/content'), '@/utils/normalizePhoneRecipient':require('../dist/src/utils/normalizePhoneRecipient'),
    '@/server/libs/makeWASocket':{default:()=>{throw new Error('No live sockets allowed')},session:new Map()},
    '@/server/libs/qrState':{waitForQr:()=>{throw new Error('No live QR allowed')}}, '@/server/libs/pairingState':{isPairingInProgress:()=>false},
  }).default;
  const invoke=async(action,body,expected=202,method='POST')=>{
    const response={statusCode:200,setHeader(){},status(v){this.statusCode=v;return this},json(v){this.data=v;return this},end(){return this}};
    await publicApi({method,headers:{authorization:'Bearer '+phones[2].token},query:{action,...(method==='GET'?body:{})},body},response);
    assert.equal(response.statusCode,expected,action+JSON.stringify(response.data)); return response.data;
  };
  const payloads={
    poll:{name:'Pilih',values:['A','B'],selectableCount:1}, button:{text:'Info',buttons:[{id:'a',text:'A'}]},
    list:{text:'Info',title:'Menu',buttonText:'Pilih',rows:[{id:'a',title:'A'}]}, location:{latitude:-6.2,longitude:106.8}, vcard:{name:'Admin',number:'6281234567890'},
  };
  for(const [kind,payload] of Object.entries(payloads)) await invoke('send-'+kind,{number:'081234567890',payload,transaction_id:'test-'+kind});
  await invoke('send-media',{number:'081234567890',media_id:media.id,message:'Caption',transaction_id:'test-media'});
  const stickerId=randomUUID(), filename=stickerId+'.webp';
  const stickerPath=path.join(process.cwd(),'storage','campaign-media',filename); fs.writeFileSync(stickerPath,Buffer.from('mock-sticker')); files.push(stickerPath);
  await prisma.mediaAsset.create({data:{id:stickerId,userId:owner.id,name:'mock.webp',mime:'image/webp',filename,size:12}});
  await invoke('send-sticker',{number:'081234567890',media_id:stickerId,transaction_id:'test-sticker'});
  const queued=await invoke('send-message',{number:'081234567890',message:'Public',transaction_id:'test-message'});
  const repeated=await invoke('send-message',{number:'081234567890',message:'Public',transaction_id:'test-message'}); assert.equal(repeated.data[0].id,queued.data[0].id);
  await invoke('send-message',{number:'081234567890',message:'Changed',transaction_id:'test-message'},409);
  await invoke('send-poll',{number:'bad',payload:JSON.stringify(payloads.poll)},400,'GET');
  await invoke('send-list',{number:'081234567890',payload:JSON.stringify(payloads.list),transaction_id:'test-get-list'},202,'GET');
  assert.equal(sends,2,'API admission must not send synchronously');
  const encoded=new URLSearchParams({api_key:phones[2].token,number:'081234567890',payload:JSON.stringify(payloads.poll),transaction_id:'wire-form-poll'});
  const wire=await fetch(base+'/api/public/send-poll',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:encoded.toString()}); assert.equal(wire.status,202); assert((await wire.json()).queued);
  const getWire=await fetch(base+'/api/public/send-list?'+new URLSearchParams({number:'081234567890',payload:JSON.stringify(payloads.list),transaction_id:'wire-get-list'}),{headers:{Authorization:'Bearer '+phones[2].token}}); assert.equal(getWire.status,202);
  assert.equal((await fetch(base+'/api/public/generate-qr',{method:'POST',headers:{Authorization:'Bearer '+phones[2].token}})).status,503);
  assert.equal((await fetch(base+'/api/public/session',{headers:{Authorization:'Bearer '+owner.token}})).status,401);
  const disconnected=await fetch(base+'/api/public/disconnect',{method:'POST',headers:{Authorization:'Bearer '+phones[2].token}}); assert.equal(disconnected.status,200); assert.equal((await prisma.phone.findUnique({where:{id:phones[2].id}})).active,0);
  const safeWebhook=require('../dist/src/server/utils/sendDeviceWebhook');
  await assert.rejects(safeWebhook.sendDeviceWebhook('http://127.0.0.1/private',{}),/PRIVATE_WEBHOOK_ADDRESS/);
  const auto=load('src/server/campaigns/autoReply.js',{'../../lib/prisma':{prisma}});
  const rule=await prisma.autoReply.create({data:{userId:owner.id,phoneId:phones[2].id,keyword:'info | menu',type:'list',reply:{kind:'list',...payloads.list},is_quoted:true}});
  let sentReply; await auto.sendAutoReply(rule,phones[2],{sendMessage:async(jid,content,options)=>{sentReply={jid,content,options};return {key:{id:'mock'}}}},[{key:{remoteJid:'6281234567890@s.whatsapp.net'},message:{conversation:'info'}}]);
  assert(sentReply.options.quoted); assert(sentReply.content.forward.message.listMessage); assert.equal((await prisma.autoReply.findUnique({where:{id:rule.id}})).sentCount,1);
  const { parseCsv,csvCell }=require('../dist/src/server/campaigns/csv'); assert.deepEqual(parseCsv('nama,nomor\r\n"Budi, A",081234567890'),[['nama','nomor'],['Budi, A','081234567890']]); assert.equal(csvCell('=1+1'),'"\'=1+1"');
  const { messageKeywordTypeChecker }=require('../dist/src/server/utils/messageKeywordTypeChecker'); assert(messageKeywordTypeChecker('INFO','promo | info','Equal')); assert(!messageKeywordTypeChecker('anything',' | ','Contain'));
  if(process.env.UPGRADE_SCREENSHOTS==='true') {
    const {chromium}=require(process.env.UPGRADE_PLAYWRIGHT_PATH); const browser=await chromium.launch({headless:true,channel:process.env.UPGRADE_BROWSER_CHANNEL || 'msedge'});
    const cookie=await encode({token:{id:owner.id,email:owner.email,name:owner.name},secret:process.env.NEXTAUTH_SECRET,maxAge:3600});
    const context=await browser.newContext({viewport:{width:1440,height:1000}}); await context.addCookies([{name:'next-auth.session-token',value:cookie,url:base}]);
    const page=await context.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    for(const route of ['campaigns','contacts','media','admin','api-docs']) { await page.goto(base+'/dashboard/'+route); await page.waitForLoadState('networkidle'); await page.screenshot({path:'deployment/upgrade-'+route+'-desktop.png',fullPage:true}); }
    {
      await page.goto(base+'/dashboard/contacts'); await page.locator('input[type=file]').setInputFiles(path.join(__dirname,'fixtures','contact-import.xlsx'));
      await page.getByText('Impor selesai. Nomor yang sudah ada dilewati.',{exact:true}).waitFor(); assert.equal((await api('/api/contacts')).total,4);
    }
    await page.setViewportSize({width:1440,height:1400}); await page.goto(base+'/dashboard/campaigns'); await page.getByRole('button',{name:'Buat Campaign'}).click(); await page.waitForFunction(()=>document.querySelector('.ant-modal')?.getAnimations().every(a=>a.playState==='finished') && !document.querySelector('.ant-modal')?.className.includes('zoom')); await page.screenshot({path:'deployment/upgrade-campaign-form.png',fullPage:true});
    await page.getByLabel('Close',{exact:true}).click(); await page.setViewportSize({width:390,height:844}); await page.reload(); await page.waitForLoadState('networkidle'); await page.screenshot({path:'deployment/upgrade-campaign-mobile.png',fullPage:true});
    await page.goto(base+'/es/dashboard/campaigns'); await page.waitForLoadState('networkidle'); assert(await page.getByRole('button',{name:'Crear campaña'}).count());
    assert.deepEqual(errors,[],'browser runtime errors'); await browser.close();
  }
  console.log('Upgrade checks passed: real database/API isolation, dedupe, schedule, pause/resume/clear, leases/random delay, ACK uncertainty, media, contacts, reports, admin and mock transport.');
})().finally(async()=>{
  await cleanupQuery(()=>prisma.waDispatch.deleteMany({where:{userId:{in:users}}})); await prisma.campaign.deleteMany({where:{userId:{in:users}}});
  await prisma.contact.deleteMany({where:{userId:{in:users}}}); await prisma.contactGroup.deleteMany({where:{userId:{in:users}}}); await prisma.deviceContact.deleteMany({where:{userId:{in:users}}});
  await prisma.mediaAsset.deleteMany({where:{userId:{in:users}}}); await prisma.waSenderLease.deleteMany({where:{phoneId:{in:phones.map(p=>p.id)}}});
  await prisma.autoReply.deleteMany({where:{userId:{in:users}}}); await prisma.phone.deleteMany({where:{userId:{in:users}}}); await prisma.user.deleteMany({where:{id:{in:users}}});
  for(const file of files) fs.rmSync(file,{force:true}); await prisma.$disconnect();
}).catch(e=>{ console.error(e); process.exitCode=1; });
