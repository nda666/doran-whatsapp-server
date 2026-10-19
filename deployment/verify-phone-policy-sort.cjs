'use strict';
// Synthetic data only: no production database, credentials, network, or WhatsApp.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file, mocks = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require','module','exports',code)(key => key in mocks ? mocks[key] : require(key),module,module.exports);
  return module.exports;
}
const sort = load('src/lib/phonePolicySort.ts');
const table = load('src/lib/tableQuery.ts');
const safety = load('src/server/messaging/safety.ts', Object.fromEntries([
  '../../lib/dispatchPresentation','../dispatchWebhook/events','../../lib/prisma','../../utils/normalizePhoneRecipient',
  '../../lib/deviceQuota','../dispatch/settings','../dispatch/timing',
].map(key => [key, {}])));
const controls = load('src/components/phone/PhonePolicyControls.tsx', { '@/lib/useDashboardApi': {} });
for (const key of sort.phonePolicySortFields) {
  for (const order of ['asc','desc']) {
    const column=controls.phonePolicyColumns(()=>undefined,{sort:key,order}).find(column=>column.key===key);
    assert.equal(column.sorter,true);
    assert.equal(column.sortOrder,order==='asc'?'ascend':'descend');
  }
}
assert(sort.isPhonePolicySort('quota')); assert(!sort.isPhonePolicySort('token DESC;'));
const fixtures = [
  { id:'b',health:null,quota:0,sendInterval:7000 },
  { id:'a',health:100,quota:30,sendInterval:7000 },
  { id:'c',health:60,quota:20,sendInterval:21000 },
  { id:'d',health:null,quota:2,sendInterval:7000 },
];
assert.deepEqual(sort.sortPhonePolicies(fixtures,'health','asc').map(p=>p.id),['c','a','b','d']);
assert.deepEqual(sort.sortPhonePolicies(fixtures,'health','desc').map(p=>p.id),['a','c','b','d']);
assert.deepEqual(sort.sortPhonePolicies(fixtures,'quota','desc').map(p=>p.id),['a','c','d','b']);
assert.deepEqual(sort.sortPhonePolicies(fixtures,'sendInterval','desc').map(p=>p.id),['c','a','b','d']);
assert.equal(fixtures[0].id,'b','Sorting must not mutate input');
const phones = ['a','b','c','d','e','f','foreign'].map(id=>({ id, userId:id==='foreign'?'other':'owner', name:id==='e'?'Other':'Match '+id }));
const usage = [
  { phoneId:'a',attempts:30,failures:0 }, { phoneId:'c',attempts:20,failures:8 },
  { phoneId:'d',attempts:2,failures:0 }, { phoneId:'e',attempts:50,failures:0 },
  { phoneId:'f',attempts:40,failures:8 }, { phoneId:'foreign',attempts:999,failures:0 },
];
let allReads = 0, detailReads = 0;
const db = {
  phone: {
    findMany: async args => {
      let rows=phones.filter(p=>(!args.where.userId||p.userId===args.where.userId) && (!args.where.id||args.where.id.in.includes(p.id)) && (!args.where.OR||args.where.OR.some(clause=>clause.name&&p.name.includes(clause.name.contains))));
      if(args.select) { allReads++; assert.deepEqual(args.select,{id:true}); return rows.map(p=>({id:p.id})); }
      detailReads++;
      if(args.orderBy) rows.sort((a,b)=>a.id.localeCompare(b.id));
      if(args.take) rows=rows.slice(args.skip,args.skip+args.take);
      return [...rows].reverse(); // Deliberately scramble DB order for computed page fetching.
    },
    count: async ()=>6,
  },
  deviceDailyUsage: { findMany: async args => {
    assert.equal(args.where.day,'2026-10-17');
    assert(!args.where.phoneId.in.includes('foreign'),'Owner filtering must precede policy reads');
    return usage.filter(u=>args.where.phoneId.in.includes(u.phoneId));
  } },
  deviceSendPolicy: { findMany: async ()=>[
    { phoneId:'c',minIntervalSeconds:null,adaptiveEnabled:true },
    { phoneId:'d',minIntervalSeconds:30,adaptiveEnabled:true },
    { phoneId:'f',minIntervalSeconds:10,adaptiveEnabled:false },
  ] },
  waDispatch: { groupBy: async ()=>[] },
};
const service = load('src/server/messaging/phonePolicySort.ts', {
  '../../lib/prisma': {prisma:db}, '../../lib/phonePolicySort':sort,
  '../dispatch/settings':{ getDispatchDelayRange:async()=>({minSeconds:7,maxSeconds:15}) },
  './safety':{ ...safety,usageDay:()=> '2026-10-17' },
});
const handler=load('src/pages/api/phones/index.ts', {
  '@/server/dispatch/settings':{getDispatchDisplayWindow:async()=>({days:7,createdAt:{}})},
  '@/lib/tableQuery':table, '@/lib/access':{isSuperAdmin:()=>false,ownerScope:user=>({userId:user.id})},
  '@/lib/prisma':{prisma:db}, '@/middleware/apiAuthMiddleware':{__esModule:true,default:fn=>fn},
  '@/server/deviceWebhook/events':{}, '@/server/phoneConnectionInfo':{getPhoneConnectionInfo:async()=>({state:'online'})},
  '@/lib/phonePolicySort':sort,'@/server/messaging/phonePolicySort':service,
}).default;
const request = async query => {
  const res={setHeader(){},json(body){this.body=body;return this;}};
  await handler({method:'GET',query,user:{id:'owner'}},res);
  return res.body;
};
(async()=>{
  const filtered={userId:'owner',OR:[{name:{contains:'Match'}}]};
  assert.deepEqual((await service.phonePolicyPage(filtered,'quota','desc',0,2)).ids,['f','a']);
  assert.deepEqual((await service.phonePolicyPage(filtered,'quota','desc',2,2)).ids,['c','d']);
  assert.deepEqual((await service.phonePolicyPage(filtered,'quota','asc',0,10)).ids,['b','d','c','a','f']);
  assert.deepEqual((await service.phonePolicyPage(filtered,'health','asc',0,10)).ids,['c','f','a','b','d']);
  assert.deepEqual((await service.phonePolicyPage(filtered,'health','desc',0,10)).ids,['a','f','c','b','d']);
  assert.deepEqual((await service.phonePolicyPage(filtered,'sendInterval','desc',0,10)).ids,['d','c','f','a','b']);
  assert.deepEqual((await service.phonePolicyPage(filtered,'quota','desc',50,5)),{ids:[],total:5});
  const first=await request({page:'1',limit:'2',sort:'quota',order:'desc',name:'Match'});
  const second=await request({page:'2',limit:'2',sort:'quota',order:'desc',name:'Match'});
  assert.deepEqual(first.data.map(p=>p.id),['f','a']);
  assert.deepEqual(second.data.map(p=>p.id),['c','d']);
  assert.equal(first.total,5); assert.equal(second.page,2);
  assert(first.data.every(p=>p.userId==='owner'&&p.connection.state==='online'));
  const oldReads=allReads;
  await request({page:'1',limit:'2',sort:'createdAt',order:'desc'});
  assert.equal(allReads,oldReads,'Native sorts must keep their original database pagination path');
  const beforeDetails=detailReads;
  assert.equal((await request({page:'100',limit:'2',sort:'health',order:'desc'})).data.length,0);
  assert.equal(detailReads,beforeDetails+1);
  console.log('PHONE_POLICY_SORT_PASSED: numeric order, null health last, stable ties, owner/filter scope, missing usage, adaptive interval, all-device pagination, API ordering and native-sort regression');
})().catch(error=>{console.error(error);process.exitCode=1;});
