const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { createRequire } = require('node:module');
const { EventEmitter } = require('node:events');
function load(relative, stubs = {}) {
  const filename = path.resolve(__dirname, '..', relative), module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  const real = createRequire(filename);
  new Function('require', 'module', 'exports', source)(name => Object.hasOwn(stubs, name) ? stubs[name] : real(name), module, module.exports);
  return module.exports;
}
let helpers;
const access = load('src/lib/access.ts');
const initialPhone = { id: '11111111-1111-4111-8111-111111111111', userId: 'owner', name: 'Old', number: '62810000000', active: 1, token: 'old-token', account_name: 'WA', qrCode: 'must-never-leak', readReceipt: false, rejectCall: false, showOnline: true, showTyping: false, is_save_group: false, webhookUrl: null };
let config, phone, jobs, requests, failDelivery, dispatches;
const matches = (row, where) => Object.entries(where || {}).every(([key, value]) => {
  if (key === 'AND') return value.every(w => matches(row,w));
  if (key === 'OR') return value.some(w => matches(row,w));
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    if (value.gt !== undefined) return row[key] > value.gt;
    if (value.not !== undefined) return row[key] !== value.not;
    if (value.in) return value.in.includes(row[key]);
    if (value.notIn) return !value.notIn.includes(row[key]);
    if (value.lt) return row[key] < value.lt;
  }
  return row[key] === value;
});
function reset() {
  config = { id: 1, enabled: true, revision: 'revision-1', url: 'https://cashier.example.com/hook', secret: 'test-secret-1234567890' };
  dispatches = []; phone = { ...initialPhone }; jobs = []; requests = []; failDelivery = false;
}
const tx = {
  waDispatchAttempt: { updateMany: async () => ({ count: 0 }) },
  recipientSuppression: { findMany: async () => [] },
  $queryRaw: async (strings, id) => strings.join('').includes('SELECT status') ? (dispatches.filter(j => j.id === id).map(j => ({status:j.status}))) : [],
  waDispatch: {
    findMany: async ({where}) => dispatches.filter(j=>matches(j,where)).map(j=>({...j})),
    findUniqueOrThrow: async ({where}) => ({...dispatches.find(j=>matches(j,where))}),
    updateMany: async ({where,data}) => { const rows=dispatches.filter(j=>matches(j,where)); rows.forEach(j=>{for(const [k,v] of Object.entries(data)) j[k]=v?.increment ? j[k]+v.increment:v;}); return {count:rows.length}; },
    createMany: async ({data}) => {let count=0; for(const j of data) if(!dispatches.some(old=>old.id===j.id || old.dedupeKey===j.dedupeKey)) { dispatches.push({status:'QUEUED', attempts:0, ...j}); count++; } return {count};},
  },
  phone: {
    findFirst: async ({ where }) => phone && matches(phone, where) ? { ...phone } : null,
    findUniqueOrThrow: async () => ({ ...phone }),
    updateMany: async ({ data }) => { Object.assign(phone, data); return { count: 1 }; },
  },
  user: { findUnique: async () => ({ id: 'owner', name: 'Owner', email: 'owner@example.com' }) },
  dispatchWebhookSetting: {
    findUnique: async () => config && { ...config },
    upsert: async ({ update, create }) => { config = config ? { ...config, ...update } : { ...create }; return config; },
  },
  dispatchWebhookEvent: {
    createMany: async ({data}) => {for(const row of data) await tx.dispatchWebhookEvent.create({data:row});return {count:data.length};},
    create: async ({ data }) => { const job = { id: jobs.length + 1, status: 'PENDING', attempts: 0, nextAttemptAt: new Date(), createdAt: new Date(), ...data }; jobs.push(job); return job; },
    findFirst: async ({ where }) => { const row = jobs.find(row => matches(row, where)); return row ? { ...row } : null; },
    findMany: async ({ select }) => jobs.map(row => Object.fromEntries(Object.keys(select).map(key => [key, row[key]]))),
    update: async ({ where, data }) => { const row = jobs.find(row => matches(row, where)); assert(row); for (const [key, value] of Object.entries(data)) row[key] = value?.increment ? row[key] + value.increment : value; return row; },
    updateMany: async ({ where, data }) => { const found = jobs.filter(row => matches(row, where)); found.forEach(row => Object.assign(row, data)); return { count: found.length }; },
  },
};
const db = { ...tx, $transaction: async fn => {
  const oldPhone = phone && { ...phone }, oldJobs = structuredClone(jobs), oldConfig = config && { ...config }, oldDispatches = structuredClone(dispatches);
  try { return await fn(tx); } catch (error) { dispatches = oldDispatches; phone = oldPhone; jobs = oldJobs; config = oldConfig; throw error; }
} };
helpers = load('src/server/dispatchWebhook/events.ts', { '../../lib/prisma': { prisma: db } });
const worker = load('src/server/dispatchWebhook/worker.ts', {
  '../../lib/prisma': { prisma: db }, '../utils/sendDeviceWebhook': { sendDeviceWebhook: async (url, body, headers) => { requests.push({ url, body, headers }); if (failDelivery) throw new Error('down'); } },
});
const settingsHandler = load('src/pages/api/admin/dispatch-webhook.ts', {
  '@/lib/prisma': { prisma: db }, '@/lib/access': access, '@/server/dispatchWebhook/events': helpers,
  '@/middleware/apiSuperAdminMiddleware': { __esModule: true, default: fn => fn },
}).default;
async function api(body, method = 'POST', user = { id: 'admin', role: 'ADMIN', email: 'admin@gmail.com', approvalStatus: 'APPROVED' }) {
  const res = { code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, end() { return this; } };
  await settingsHandler({ body, method, user }, res); return res;
}

const receipts = load('src/server/dispatch/receipts.ts', {'../dispatchWebhook/events':helpers, '../../lib/prisma':{prisma:db}});
const job = () => ({id:'dispatch-1',clientJobId:'kasir-job-1',dedupeKey:'dedupe-1',phoneId:'phone-1',senderPhoneId:null,senderGroupId:null,userId:'owner',storeId:'store-1',transactionId:'trx-1',messageKey:'default',recipient:'6281234567890',status:'QUEUED',attempts:0,message:'private-message',image:'private-image',messageId:'message-1',createdAt:new Date(),updatedAt:new Date()});
(async()=>{
 reset(); config.enabled=false; await helpers.createDispatches(tx,{data:[job()]}); assert.equal(jobs.length,0);
 reset(); await helpers.createDispatches(tx,{data:[job()]}); assert.equal(jobs.length,1); let payload=JSON.parse(jobs[0].payload); assert.equal(payload.event,'dispatch.status_changed'); assert.equal(payload.previous_status,null); assert.equal(payload.dispatch.job_id,'kasir-job-1'); assert.equal(payload.dispatch.transaction_id,'trx-1'); assert(!JSON.stringify(payload).includes('private-message')); assert(!JSON.stringify(payload).includes('private-image'));
 await helpers.createDispatches(tx,{data:[job()],skipDuplicates:true}); assert.equal(jobs.length,1,'Repeated insert emits no event');
 await helpers.createDispatches(tx,{data:[{...job(),id:'dispatch-duplicate'}],skipDuplicates:true}); assert.equal(jobs.length,1,'Deduped UUID emits no event');
 await helpers.updateDispatches({where:{id:'dispatch-1',status:'QUEUED'},data:{status:'PROCESSING',attempts:{increment:1}}}); assert.equal(jobs.length,2); assert.equal(JSON.parse(jobs[1].payload).previous_status,'QUEUED');
 await helpers.updateDispatches({where:{id:'dispatch-1',status:'QUEUED'},data:{status:'FAILED'}}); assert.equal(jobs.length,2,'Lost claim emits no event');
 await helpers.updateDispatches({where:{id:'dispatch-1'},data:{status:'PROCESSING'}}); assert.equal(jobs.length,2,'Same status emits no event');
 await helpers.updateDispatches({where:{id:'dispatch-1'},data:{leaseUntil:new Date()}}); assert.equal(jobs.length,2,'Heartbeat emits no event');
 await receipts.recordDispatchReceipt('phone-1','message-1',2); await receipts.recordDispatchReceipt('phone-1','message-1',3); await receipts.recordDispatchReceipt('phone-1','message-1',4); assert.deepEqual(jobs.map(j=>JSON.parse(j.payload).dispatch.status),['QUEUED','PROCESSING','SENT','DELIVERED','READ']);
 await receipts.recordDispatchReceipt('phone-1','message-1',3); await receipts.recordDispatchReceipt('phone-1','message-1',4); assert.equal(jobs.length,5,'Late and duplicate receipts cannot regress status');
 for(const status of ['FAILED','UNCERTAIN']) {reset();dispatches=[job()];await helpers.updateDispatches({where:{id:'dispatch-1'},data:{status,lastError:'FAILURE'}});assert.equal(JSON.parse(jobs[0].payload).dispatch.status,status);assert.equal(JSON.parse(jobs[0].payload).dispatch.error,'FAILURE');}
 reset(); dispatches=[job()]; const create=tx.dispatchWebhookEvent.create;tx.dispatchWebhookEvent.create=async()=>{throw Error('outbox down');};await assert.rejects(helpers.updateDispatches({where:{id:'dispatch-1'},data:{status:'SENT'}}));assert.equal(dispatches[0].status,'QUEUED','Outbox failure rolls back status');tx.dispatchWebhookEvent.create=create;
 reset();await helpers.enqueueDispatchEvent(tx,job());await worker.processDispatchWebhook();assert.equal(jobs[0].status,'DELIVERED');assert.equal(jobs[0].payload,null);assert.equal(requests[0].body.sequence,jobs[0].id);assert.equal(requests[0].headers.Authorization,'Bearer '+config.secret);
 reset();await helpers.enqueueDispatchEvent(tx,job());const eventId=jobs[0].eventId;failDelivery=true;await worker.processDispatchWebhook();assert.equal(jobs[0].status,'PENDING');assert.equal(jobs[0].attempts,1);jobs[0].nextAttemptAt=new Date(0);failDelivery=false;await worker.processDispatchWebhook();assert.equal(requests[1].body.event_id,eventId);assert.equal(jobs[0].status,'DELIVERED');
 reset();await helpers.enqueueDispatchEvent(tx,job());jobs[0].attempts=7;failDelivery=true;await worker.processDispatchWebhook();assert.equal(jobs[0].status,'FAILED');assert.equal(jobs[0].payload,null);
 reset();await helpers.enqueueDispatchEvent(tx,job());config.revision='changed';await worker.processDispatchWebhook();assert.equal(jobs[0].status,'CANCELLED');assert.equal(requests.length,0);
 reset();await helpers.enqueueDispatchEvent(tx,job());await helpers.enqueueDispatchEvent(tx,job());jobs[0].nextAttemptAt=new Date(Date.now()+60000);await worker.processDispatchWebhook();assert.equal(requests.length,0,'Retry preserves FIFO');
 reset();let response=await api({},'GET');assert.equal(response.body.settings.secret,undefined);response=await api({action:'test'});assert.equal(response.code,202);assert.equal(JSON.parse(jobs[0].payload).dispatch,null);
 response=await api({enabled:true,url:'https://cashier.example.com/new'});assert.equal(response.code,200);assert.equal(jobs[0].status,'CANCELLED');assert.equal(config.secret,'test-secret-1234567890');
 response=await api({enabled:true,url:'http://cashier.example.com/hook'});assert.equal(response.code,400);
 response=await api({},'GET',{id:'ordinary',role:'USER',email:'ordinary@example.com'});assert.equal(response.code,403);
 reset();config.secret='';response=await api({enabled:true,url:config.url});assert.equal(response.code,400);
 console.log('Dispatch webhook: transition, receipt, dedupe, rollback, retry, FIFO, revision and admin checks passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});

