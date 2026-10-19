const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { createRequire } = require('node:module'), ts = require('typescript');
const defaults = value => ({ __esModule: true, default: value });
function load(relative, stubs = {}) {
  const filename = path.resolve(__dirname, '..', relative), module = { exports: {} }, real = createRequire(filename);
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', code)(name => Object.hasOwn(stubs, name) ? stubs[name] : real(name), module, module.exports);
  return module.exports;
}
const users = [{ id: 'owner', token: 'user-token', isActive: true, approvalStatus: 'APPROVED' }, { id: 'other', token: 'other-user-token', isActive: true, approvalStatus: 'APPROVED', role: 'ADMIN', email: 'admin@gmail.com' }];
const phones = [{ id: 'own-phone', userId: 'owner', token: 'device-token', active: 1, isOnline: true }, { id: 'second-phone', userId: 'owner', token: 'second-device-token', active: 1, isOnline: false }, { id: 'foreign-phone', userId: 'other', token: 'foreign-device-token', active: 1, isOnline: false }];
const jobs = [{ id: 'dispatch-1', phoneId: 'own-phone', userId: 'owner', transactionId: 'ORDER-1', storeId: 'default', status: 'QUEUED' }];
let enqueues = 0, sendingDisabled = false;
const db = { phone: {
  findUnique: async ({ where }) => phones.find(phone => phone.token === where.token) || null,
  findFirst: async ({ where }) => phones.find(phone => phone.id === where.id && phone.userId === where.userId) || null,
}, user: { findUnique: async ({ where }) => users.find(user => where.token ? user.token === where.token : user.id === where.id) || null },
waDispatch: {
  findMany: async ({ where }) => jobs.filter(job => job.phoneId === where.phoneId && (!where.id || job.id === where.id)),
  count: async ({ where }) => jobs.filter(job => job.phoneId === where.phoneId && (!where.id || job.id === where.id)).length,
} };
const access = load('src/lib/access.ts'), auth = load('src/server/dispatchAuth.ts', { '@/lib/prisma': { prisma: db }, '@/lib/access': access });
const responseBody = { result: true, queued: true, data: [{ id: 'dispatch-1', status: 'QUEUED' }], status_url: '/api/send-status' };
const queue = {
  requestJobId: body => body.job_id || null, requestJobKey: (phoneId, id) => phoneId + id, dispatchSummary: job => ({ id: job.id, status: job.status }),
  prepareDispatch() {}, existingRequestJob: async (_, body) => body.job_id === 'existing' ? { ...responseBody, existing: true } : null,
  enqueueDispatch: async (phoneId, userId) => { assert.equal(phoneId, 'own-phone'); assert.equal(userId, 'owner'); enqueues++; return responseBody; },
  DispatchError: class extends Error { constructor(status,message) { super(message); this.status=status; } },
};
const stubs = { '@/server/dispatchAuth': auth, '@/lib/prisma': { prisma: db }, '@/server/dispatch/queue': queue,
  '@/server/libs/sendMessageFromIo': defaults(async () => { assert(sendingDisabled); return ['fake-transport-result']; }),
  '@/validations/sendMessage': { SendMessageValidation: async () => ({ result: true }) } };
const send = load('src/pages/api/send-message.ts', stubs).default, status = load('src/pages/api/send-status.ts', stubs).default;
async function request(handler, body, authorization, query = {}, method = 'POST') {
  const res = { code: 200, setHeader() {}, status(n) { this.code = n; return this; }, json(v) { this.body = v; return this; } };
  await handler({ method, body, query, headers: authorization ? { authorization } : {} }, res); return res;
}
const payload = { number: '6281234567890', message: 'Synthetic test', transaction_id: 'ORDER-1' };
process.env.DISPATCH_QUEUE_ENABLED = 'true';
(async () => {
  const legacy = await request(send, { ...payload, api_key: 'device-token' }); assert.equal(legacy.code, 200);
  for (const [body, header, query, method] of [
    [{ ...payload }, 'Bearer device-token', {}, 'POST'], [{ ...payload }, null, { api_key: 'device-token' }, 'POST'],
    [{}, null, { ...payload, api_key: 'device-token' }, 'GET'], [{ ...payload, token_api: 'device-token' }, null, {}, 'POST'],
    [{ ...payload, api_key: 'device-token' }, 'Bearer device-token', { api_key: 'device-token' }, 'POST'],
    [{ ...payload, device_id: 'own-phone' }, 'Bearer user-token', {}, 'POST'],
    [{}, 'Bearer user-token', { ...payload, device_id: 'own-phone' }, 'GET'],
  ]) { const result = await request(send, body, header, query, method); assert.equal(result.code, 200); assert.deepEqual(result.body, legacy.body); }
  const before = enqueues;
  for (const [body, header, code] of [
    [{ ...payload }, 'Bearer user-token', 400], [{ ...payload, device_id: 'foreign-phone' }, 'Bearer user-token', 403],
    [{ ...payload, device_id: 'own-phone' }, 'Bearer other-user-token', 403],
    [{ ...payload, api_key: 'device-token' }, 'Bearer user-token', 400],
    [{ ...payload, device_id: 'second-phone', api_key: 'device-token' }, null, 403],
    [{ ...payload, device_id: ['own-phone'] }, 'Bearer user-token', 400],
    [{ ...payload, device_id: 'own-phone', api_key: 'user-token' }, null, 400],
  ]) assert.equal((await request(send, body, header)).code, code);
  assert.equal(enqueues, before, 'Rejected authorization must never enqueue');
  assert.equal((await request(send, { ...payload, api_key: 'invalid' })).code, 200);
  assert.equal((await request(send, { ...payload, api_key: 'invalid' })).body.result, false);
  assert.equal((await request(status, { id: 'dispatch-1', api_key: 'invalid' })).code, 401);
  const deviceStatus = await request(status, { id: 'dispatch-1', api_key: 'device-token' });
  const userStatus = await request(status, { id: 'dispatch-1', device_id: 'own-phone' }, 'Bearer user-token'); assert.deepEqual(userStatus.body, deviceStatus.body);
  assert.equal((await request(status, { id: 'dispatch-1', device_id: 'second-phone' }, 'Bearer user-token')).body.total, 0);
  assert.equal((await request(status, { id: 'dispatch-1', device_id: 'foreign-phone' }, 'Bearer user-token')).code, 403);
  assert.equal((await request(send, { ...payload, device_id: 'own-phone' }, 'Bearer user-token', { device_id: 'second-phone' })).code, 400);
  users[0].isActive = false;
  assert.equal((await request(send, { ...payload, api_key: 'device-token' })).code, 403);
  assert.equal((await request(send, { ...payload, device_id: 'own-phone' }, 'Bearer user-token')).code, 403); users[0].isActive = true;
  users[0].approvalStatus = 'PENDING'; assert.equal((await request(status, { id: 'dispatch-1', api_key: 'device-token' })).code, 403); users[0].approvalStatus = 'APPROVED';
  phones[0].active = 0;
  assert.equal((await request(send, { ...payload, device_id: 'own-phone' }, 'Bearer user-token')).code, 409);
  assert.equal((await request(send, { ...payload, api_key: 'device-token', job_id: 'existing' })).body.existing, true);
  assert.equal((await request(send, { ...payload, device_id: 'own-phone', dry_run: true }, 'Bearer user-token')).body.active, false); phones[0].active = 1;
  sendingDisabled = true; process.env.DISPATCH_QUEUE_ENABLED = 'false';
  const directLegacy = await request(send, { ...payload, api_key: 'device-token' });
  const directUser = await request(send, { ...payload, device_id: 'own-phone' }, 'Bearer user-token'); assert.deepEqual(directUser.body, directLegacy.body);
  for (const [file, moduleName] of [['src/pages/api/public/send-message.ts','../send-message'],['src/pages/api/v2/send-message.ts','../send-message'],['src/pages/api/public/v2/send-message.ts','../../send-message'],['src/pages/api/public/send-status.ts','../send-status']]) {
    const expected = file.includes('send-status') ? status : send; assert.equal(load(file, { [moduleName]: defaults(expected) }).default, expected);
  }

  process.env.DISPATCH_QUEUE_ENABLED = 'true'; process.env.WHATSAPP_ENABLED = 'true';
  const content = load('src/server/campaigns/content.ts');
  let stored = [], directCalls = [];
  db.mediaAsset = { findFirst: async ({where}) => where.id === 'own-media' && where.userId === 'owner' ? {id:'own-media',userId:'owner',mime:'image/webp'} : null };
  db.$queryRaw = async () => []; db.waSenderLease = {createMany:async()=>{}};
  const originalFindMany = db.waDispatch.findMany;
  db.waDispatch.findMany = async args => args.where.dedupeKey ? stored : originalFindMany(args);
  db.$transaction = async fn => fn(db);
  queue.prepareDispatch = (phoneId,userId) => ({jobs:[{id:'synthetic',phoneId,userId,dedupeKey:'key',payloadHash:'hash',message:'probe',recipient:'6281234567890'}]});
  queue.dispatchResponse = () => responseBody;
  const registered = load('src/server/registeredPhones.ts', {'@/lib/prisma':{prisma:db},'@/lib/access':access,'@/utils/normalizePhoneRecipient':load('src/utils/normalizePhoneRecipient.ts')});
  db.phone.findMany = async ({where,select}) => phones.filter(p=>(!where.userId||p.userId===where.userId)&&(!where.number||p.number===where.number)).map(p=>Object.fromEntries(Object.keys(select).map(k=>[k,p[k]??null])));
  phones[0].number='6281234567890';phones[2].number='6281234567890';
  const publicApi = load('src/pages/api/public/[action].ts', {...stubs,'@/server/deviceToken':load('src/server/deviceToken.ts'),
    '@/server/dispatchWebhook/events':{createDispatches:async(_,args)=>{stored=args.data;}}, '@/server/campaigns/content':content,
    '@/server/registeredPhones':registered,'@/server/deviceWebhook/events':{},'@/utils/normalizePhoneRecipient':{},
    '@/server/libs/makeWASocket':{session:new Map()},'@/server/libs/qrState':{},'@/server/libs/pairingState':{}}).default;
  const payloads={poll:{name:'Choose',values:['A','B'],selectableCount:1},button:{text:'Hello',buttons:[{id:'a',text:'A'}]},list:{text:'Hello',title:'Menu',buttonText:'Pick',rows:[{id:'a',title:'A'}]},location:{latitude:0,longitude:0},vcard:{name:'Contact',number:'6281234567890'}};
  for(const kind of ['media','sticker','poll','button','list','location','vcard']){
    const action='send-'+kind, data={...payload,...(kind==='media'||kind==='sticker'?{media_id:'own-media'}:{payload:payloads[kind]})};
    const old=await request(publicApi,{...data,api_key:'device-token'},null,{action});assert.equal(old.code,202,action);
    const newer=await request(publicApi,{...data,device_id:'own-phone'},'Bearer user-token',{action});assert.equal(newer.code,202,action);assert.deepEqual(newer.body,old.body);
    assert.equal(stored[0].userId,'owner');assert.equal(stored[0].phoneId,'own-phone');
    assert.equal((await request(publicApi,{...data,device_id:'foreign-phone'},'Bearer user-token',{action})).code,403);
    const form=await request(publicApi,{...data,payload:payloads[kind]?JSON.stringify(payloads[kind]):undefined,device_id:'own-phone'},'Bearer user-token',{action});assert.equal(form.code,202);
  }
  assert.equal((await request(publicApi,{...payload,media_id:'foreign-media',device_id:'own-phone'},'Bearer user-token',{action:'send-media'})).code,400);
  for(const action of ['list-phones','phone-detail']){
    const body=action==='phone-detail'?{number:'081234567890'}:{};
    const old=await request(publicApi,{...body,api_key:'device-token'},null,{action});
    const newer=await request(publicApi,body,'Bearer user-token',{action});assert.equal(newer.code,200);assert.deepEqual(newer.body,old.body);
    assert(newer.body.data.every(p=>!('token'in p)&&!('qrCode'in p)));assert(newer.body.data.some(p=>p.id==='own-phone'));
    assert.equal((await request(publicApi,{...body,role:'ADMIN'},'Bearer user-token',{action})).body.access.scope,'own');
  }
  users[1].email='other-admin@example.invalid';users[1].approvalStatus='APPROVED';
  assert.equal((await request(publicApi,{},'Bearer other-user-token',{action:'list-phones'})).body.access.scope,'own');
  users[1].email='admin@gmail.com';assert.equal((await request(publicApi,{},'Bearer other-user-token',{action:'list-phones'})).body.access.scope,'all');
  assert.equal((await request(publicApi,{},'Bearer user-token',{action:'session'})).code,401);
  const direct = async data => {directCalls.push(data);return ['mock-result'];};
  const group=load('src/pages/api/send-group-message.ts',{'@/server/dispatchAuth':auth,'@/server/libs/sendGroupMessageFromIo':defaults(direct)}).default;
  const groupData={id_group:'120363000000000000@g.us',message:'probe'};
  const groupOld=await request(group,{...groupData,api_key:'device-token'});
  const groupNew=await request(group,{...groupData,device_id:'own-phone'},'Bearer user-token');assert.deepEqual(groupNew.body,groupOld.body);assert.equal(groupNew.code,200);assert.equal(directCalls.at(-1).phoneId,'own-phone');
  assert.equal((await request(group,{...groupData,device_id:'foreign-phone'},'Bearer user-token')).code,403);
  let fields={number:['6281234567890'],caption:['probe'],api_key:['device-token']};
  const attachment=load('src/pages/api/send-attachment.ts',{'@/server/dispatchAuth':auth,'@/server/deviceToken':load('src/server/deviceToken.ts'),
    formidable:{IncomingForm:class{parse(_,cb){cb(null,fields,{file:[{filepath:'mock-file',mimetype:'text/plain'}]});}}},
    '@/validations/sendAttachment':load('src/validations/sendAttachment.ts'),'@/server/libs/sendAttachmentMessageIo':defaults(direct)}).default;
  const oldFile=await request(attachment,{});
  fields={number:['6281234567890'],caption:['probe'],device_id:['own-phone']};
  const newFile=await request(attachment,{},'Bearer user-token');assert.equal(newFile.code,200);assert.deepEqual(newFile.body,oldFile.body);assert.equal(directCalls.at(-1).phoneId,'own-phone');
  fields.device_id=['foreign-phone'];assert.equal((await request(attachment,{},'Bearer user-token')).code,403);
  fields.device_id=['own-phone','foreign-phone'];assert.equal((await request(attachment,{},'Bearer user-token')).code,400);
  fields.device_id=['own-phone'];fields.api_key=['device-token'];assert.equal((await request(attachment,{},'Bearer user-token')).code,400);
  phones[0].active=0;assert.equal((await request(group,{...groupData,device_id:'own-phone'},'Bearer user-token')).code,409);
  console.log('ALL_SENDERS_DIRECTORY_AUTH_OK: legacy API key/Bearer/GET/JSON/form/query, same response envelopes, user+device ownership/no admin bypass, conflicts, status isolation, inactive accounts/devices, dry run, idempotent replay, direct fallback and all aliases. No real messages sent.');
})().catch(error => { console.error(error); process.exitCode = 1; });
