'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { createRequire } = require('node:module');
const file = path.resolve(__dirname, '../src/pages/api/dispatch-reset.ts');
const real = createRequire(file);
const id = '11111111-1111-4111-8111-111111111111';
class DispatchError extends Error { constructor(status, message) { super(message); this.status = status; } }
let row, changed, mutations, campaign, phone, race;
const tx = {
  waDispatch: { findFirst: async ({where}) => row && (!where.userId || where.userId === row.userId) ? {...row} : null },
  phone: { findFirst: async () => phone ? {id:'phone'} : null },
  campaign: { findUnique: async () => campaign },
  $queryRaw: async () => [],
};
const stubs = {
  '@/lib/prisma': {prisma: {$transaction: async fn => fn(tx)}},
  '@/lib/access': {ownerScope: user => user.admin ? {} : {userId:user.id}},
  '@/middleware/apiAuthMiddleware': handler => handler,
  '@/server/dispatch/queue': {DispatchError},
  '@/server/dispatchWebhook/events': {updateDispatches: async (args, client) => {
    assert.equal(client, tx); mutations++; changed = args;
    assert.equal(args.where.sentAt, null); assert.equal(args.where.deliveredAt, null); assert.equal(args.where.readAt, null);
    assert.equal(args.where.updatedAt, row.updatedAt);
    if (race || row.status !== args.where.status) return {count:0};
    Object.assign(row,args.data); return {count:1};
  }},
};
const moduleObject = {exports:{}};
new Function('require','module','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{
  compilerOptions:{module:1,target:7,esModuleInterop:true},
}).outputText)(name => stubs[name] || real(name), moduleObject, moduleObject.exports);
const handler = moduleObject.exports.default;
function setup(status='FAILED') {
  row={id,userId:'owner',phoneId:'phone',status,attempts:5,messageId:'old-message',lastError:'ERROR',
    sentAt:null,deliveredAt:null,readAt:null,updatedAt:new Date('2026-10-14'),createdAt:new Date('2026-10-01'),
    transactionId:'keep-transaction',dedupeKey:'keep-key',message:'keep-message',campaignId:null};
  mutations=0; changed=null; phone=true; campaign=null; race=false;
}
async function request({method='POST',body={id},user={id:'owner'}}={}) {
  const res={code:200,setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;return this;},end(){return this;}};
  await handler({method,body,user},res); return res;
}
(async()=>{
  for(const status of ['FAILED','UNCERTAIN']) {
    setup(status); const result=await request(); assert.equal(result.code,200); assert.equal(mutations,1);
    assert.equal(row.status,'QUEUED'); assert.equal(row.attempts,0);
    for(const key of ['messageId','lastError','leaseToken','leaseUntil']) assert.equal(row[key],null);
    assert.equal(row.createdAt,row.nextAttemptAt); assert.equal(row.expiresAt-row.createdAt,86400000);
    assert.equal(row.message,'keep-message'); assert.equal(row.dedupeKey,'keep-key'); assert.equal(row.transactionId,'keep-transaction');
    assert.equal((await request()).code,409); assert.equal(mutations,1);
  }
  for(const status of ['QUEUED','PROCESSING','SENT','DELIVERED','READ']) {setup(status);assert.equal((await request()).code,409);assert.equal(mutations,0);}
  for(const key of ['sentAt','deliveredAt','readAt']) {setup();row[key]=new Date();assert.equal((await request()).code,409);assert.equal(mutations,0);}
  setup(); assert.equal((await request({user:{id:'other'}})).code,404);assert.equal(mutations,0);
  setup(); assert.equal((await request({user:{id:'admin',admin:true}})).code,200);
  setup(); phone=false;assert.equal((await request()).code,409);assert.equal(mutations,0);
  for(const status of ['COMPLETED','CANCELLED','PAUSED']) {setup();row.campaignId='campaign';campaign={status};assert.equal((await request()).code,409);assert.equal(mutations,0);}
  setup();row.campaignId='campaign';campaign={status:'WAITING'};assert.equal((await request()).code,200);
  setup();race=true;assert.equal((await request()).code,409);
  for(const body of [{},{id:'invalid'},{id,status:'QUEUED'}]) {setup();assert.equal((await request({body})).code,400);assert.equal(mutations,0);}
  setup();assert.equal((await request({method:'GET'})).code,405);assert.equal(mutations,0);
  console.log('DISPATCH_RESET_OK: status guards, receipt/race checks, duplicate reset, owner access, validation, campaign/device guards and reset fields');
})().catch(error=>{console.error(error);process.exitCode=1;});
