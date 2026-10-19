const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
require('@next/env').loadEnvConfig(process.cwd(), false);
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient(), base = 'https://dashboard.jeblast.com';
const prefix = 'dual-auth-live-' + randomUUID(), hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const userIds = [], phoneIds = []; let jobId;
async function request(path, data, token, method = 'POST', form = false, queryKey) {
  const headers = token ? { Authorization: 'Bearer ' + token } : {};
  let url = base + path, body;
  if (method === 'GET') url += '?' + new URLSearchParams(data);
  else { headers['Content-Type'] = form ? 'application/x-www-form-urlencoded' : 'application/json'; body = form ? new URLSearchParams(data).toString() : JSON.stringify(data); }
  if (queryKey) url += (url.includes('?') ? '&' : '?') + new URLSearchParams({ api_key: queryKey });
  const response = await fetch(url, { method, headers, ...(body ? { body } : {}), signal: AbortSignal.timeout(20000) });
  return { code: response.status, body: await response.json() };
}
(async () => {
  for (const suffix of ['owner', 'other']) {
    const user = await db.user.create({ data: { name: prefix + '-' + suffix, email: prefix + '-' + suffix + '@example.invalid', password: 'unused-test-account-hash', token: randomUUID(), approvalStatus: 'APPROVED', role: 'USER', isActive: true } }); userIds.push(user.id);
    // Never pair/activate these devices. The only dispatch is terminal FAILED, so no worker can send it.
    const phone = await db.phone.create({ data: { name: prefix + '-' + suffix, userId: user.id, token: randomUUID(), active: 0, isOnline: false, status: 'CLOSE', number: '6281234567890' } }); phoneIds.push(phone.id);
  }
  const [owner, other] = await Promise.all(userIds.map(id => db.user.findUniqueOrThrow({ where: { id } })));
  const [phone, foreign] = await Promise.all(phoneIds.map(id => db.phone.findUniqueOrThrow({ where: { id } })));
  const clientJobId = prefix + '-request';
  const dispatch = await db.waDispatch.create({ data: { userId: owner.id, phoneId: phone.id, storeId: 'default', transactionId: prefix, messageKey: 'default', recipient: '6281234567890', dedupeKey: hash([prefix,'dedupe']), payloadHash: hash(prefix), message: 'Synthetic terminal record; never send', status: 'FAILED', expiresAt: new Date(Date.now() + 60000), clientJobId, requestJobKey: hash([phone.id,clientJobId]) } }); jobId = dispatch.id;
  const payload = { number: '6281234567890', message: 'Synthetic replay', job_id: clientJobId };
  const legacy = await request('/api/send-message', { ...payload, api_key: phone.token }); assert.equal(legacy.code, 200); assert.equal(legacy.body.existing, true); assert.equal(legacy.body.data[0].status, 'FAILED');
  for (const endpoint of ['/api/send-message','/api/public/send-message','/api/v2/send-message','/api/public/v2/send-message']) {
    for (const [data, token, method, form, query] of [
      [{...payload,api_key:phone.token},null,'POST',false], [{...payload},phone.token,'POST',false],
      [{...payload,api_key:phone.token},null,'POST',true], [{...payload,api_key:phone.token},null,'GET',false],
      [{...payload},null,'POST',false,phone.token], [{...payload,token_api:phone.token},null,'POST',false],
      [{...payload,device_id:phone.id},owner.token,'POST',false], [{...payload,device_id:phone.id},owner.token,'POST',true],
      [{...payload,device_id:phone.id},owner.token,'GET',false],
    ]) { const result = await request(endpoint, data, token, method, form, query); assert.equal(result.code, 200, endpoint); assert.deepEqual(result.body, legacy.body); }
  }

  for(const kind of ['media','sticker','poll','button','list','location','vcard'])for(const root of ['/api/','/api/public/']){
    const endpoint=root+'send-'+kind;
    const old=await request(endpoint,{...payload,api_key:phone.token});assert.equal(old.code,202,endpoint);assert.deepEqual(old.body,legacy.body);
    for(const method of ['POST','GET']){
      const newer=await request(endpoint,{...payload,device_id:phone.id},owner.token,method);assert.equal(newer.code,202,endpoint);assert.deepEqual(newer.body,old.body);
    }
    const form=await request(endpoint,{...payload,device_id:phone.id},owner.token,'POST',true);assert.equal(form.code,202);
    assert.equal((await request(endpoint,{...payload},owner.token)).code,400);
    assert.equal((await request(endpoint,{...payload,device_id:foreign.id},owner.token)).code,403);
  }
  for(const root of ['/api/','/api/public/']){
    const endpoint=root+'send-group-message',group={id_group:'120363000000000000@g.us',message:'No send: inactive fixture'};
    const old=await request(endpoint,{...group,api_key:phone.token});assert.equal(old.code,409);
    const newer=await request(endpoint,{...group,device_id:phone.id},owner.token);assert.deepEqual(newer.body,old.body);assert.equal(newer.code,409);
    assert.equal((await request(endpoint,{...group,device_id:foreign.id},owner.token)).code,403);
    async function fileRequest(data,token){
      const form=new FormData();for(const [key,value]of Object.entries(data))form.append(key,value);
      const response=await fetch(base+root+'send-attachment',{method:'POST',headers:token?{Authorization:'Bearer '+token}:{},body:form,signal:AbortSignal.timeout(20000)});
      return {code:response.status,body:await response.json()};
    }
    const fileOld=await fileRequest({number:'6281234567890',caption:'No send: inactive fixture',api_key:phone.token});assert.equal(fileOld.code,409);
    const fileNew=await fileRequest({number:'6281234567890',caption:'No send: inactive fixture',device_id:phone.id},owner.token);assert.equal(fileNew.code,409);assert.deepEqual(fileNew.body,fileOld.body);
    assert.equal((await fileRequest({number:'6281234567890',device_id:foreign.id},owner.token)).code,403);
    for(const action of ['list-phones','phone-detail']){
      const data=action==='phone-detail'?{number:'081234567890'}:{};
      const a=await request(root+action,{...data,api_key:phone.token});assert.equal(a.code,200);
      const b=await request(root+action,data,owner.token);assert.equal(b.code,200);assert.deepEqual(b.body,a.body);
      assert(b.body.data.some(p=>p.id===phone.id));assert(!b.body.data.some(p=>p.id===foreign.id));
      for(const row of b.body.data)assert(!('token'in row)&&!('qrCode'in row));
      const get=await request(root+action,data,owner.token,'GET');assert.deepEqual(get.body,b.body);
    }
  }
  const admin=await db.user.findUniqueOrThrow({where:{email:'admin@gmail.com'}});
  const inventory=await request('/api/list-phones',{},admin.token);assert.equal(inventory.code,200);assert.equal(inventory.body.access.scope,'all');
  for(const id of phoneIds)assert(inventory.body.data.some(p=>p.id===id));for(const row of inventory.body.data)assert(!('qrCode'in row));
  const adminPhone=await db.phone.findFirst({where:{userId:admin.id}});
  if(adminPhone){const oldAdmin=await request('/api/list-phones',{api_key:adminPhone.token});assert.deepEqual(oldAdmin.body,inventory.body);}
  assert.equal((await request('/api/session',{},owner.token)).code,401);
  for (const endpoint of ['/api/send-status','/api/public/send-status']) {
    const deviceStatus = await request(endpoint, { id: jobId, api_key: phone.token }); assert.equal(deviceStatus.code, 200); assert.equal(deviceStatus.body.total, 1);
    const userStatus = await request(endpoint, { id: jobId, device_id: phone.id }, owner.token); assert.deepEqual(userStatus.body, deviceStatus.body);
    assert.equal((await request(endpoint, { id: jobId, api_key: foreign.token })).body.total, 0);
    assert.equal((await request(endpoint, { id: jobId, device_id: foreign.id }, owner.token)).code, 403);
  }
  for (const [body, token, code] of [
    [payload, owner.token, 400], [{...payload,device_id:foreign.id},owner.token,403], [{...payload,device_id:phone.id},other.token,403],
    [{...payload,api_key:phone.token},owner.token,400], [{...payload,api_key:phone.token,device_id:foreign.id},null,403],
    [{...payload,api_key:owner.token,device_id:phone.id},null,400],
  ]) assert.equal((await request('/api/send-message', body, token)).code, code);
  const dryLegacy = await request('/api/send-message', {...payload,api_key:phone.token,dry_run:true});
  const dryUser = await request('/api/send-message', {...payload,device_id:phone.id,dry_run:true},owner.token); assert.deepEqual(dryUser.body,dryLegacy.body); assert.equal(dryUser.body.dry_run,true);
  await db.user.update({where:{id:owner.id},data:{isActive:false}});
  assert.equal((await request('/api/send-message',{...payload,api_key:phone.token})).code,403);
  assert.equal((await request('/api/send-status',{id:jobId,device_id:phone.id},owner.token)).code,403);
  assert.equal(await db.waDispatch.count({where:{userId:{in:userIds}}}),1,'Replay/dry-run must not create any additional dispatch');
  const collectionResponse = await fetch(base+'/downloads/jeblast-api.postman_collection.json'); assert.equal(collectionResponse.status,200);
  const collection=await collectionResponse.json(); assert(collection.item.some(folder=>folder.name==='Token user + Device ID'));
  const envResponse=await fetch(base+'/downloads/jeblast-api.postman_environment.json'); const env=await envResponse.json();
  assert(env.values.some(value=>value.key==='device_id')); for(const key of ['device_token','user_token','account_password'])assert(!env.values.find(value=>value.key===key)?.value,'Public export must not contain credentials');
  console.log('ALL_SENDERS_DIRECTORY_AUTH_LIVE_OK: all legacy/user send aliases, JSON/form/GET/query/API key/Bearer/token_api, identical replay/status/dry-run responses, own-device scope, conflict/disabled-account rejection and Postman downloads. No WhatsApp messages sent.');
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(async()=>{
  if(jobId)await db.waDispatch.deleteMany({where:{id:jobId,userId:{in:userIds}}});
  if(phoneIds.length)await db.phone.deleteMany({where:{id:{in:phoneIds},name:{startsWith:prefix}}});
  if(userIds.length)await db.user.deleteMany({where:{id:{in:userIds},name:{startsWith:prefix}}});
  console.log('EXACT_DUAL_AUTH_FIXTURES_REMOVED');await db.$disconnect();
});
