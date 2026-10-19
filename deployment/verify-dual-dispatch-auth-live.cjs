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
    const phone = await db.phone.create({ data: { name: prefix + '-' + suffix, userId: user.id, token: randomUUID(), active: 0, isOnline: false, status: 'CLOSE' } }); phoneIds.push(phone.id);
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
  console.log('DUAL_DISPATCH_AUTH_LIVE_OK: all legacy/user send aliases, JSON/form/GET/query/API key/Bearer/token_api, identical replay/status/dry-run responses, own-device scope, conflict/disabled-account rejection and Postman downloads. No WhatsApp messages sent.');
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(async()=>{
  if(jobId)await db.waDispatch.deleteMany({where:{id:jobId,userId:{in:userIds}}});
  if(phoneIds.length)await db.phone.deleteMany({where:{id:{in:phoneIds},name:{startsWith:prefix}}});
  if(userIds.length)await db.user.deleteMany({where:{id:{in:userIds},name:{startsWith:prefix}}});
  console.log('EXACT_DUAL_AUTH_FIXTURES_REMOVED');await db.$disconnect();
});
