const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(name, stubs={}) {
 const module={exports:{}};
 const code=ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'..',name),'utf8'),{compilerOptions:{module:1,target:7}}).outputText;
 new Function('require','module','exports',code)(key=>{if(!(key in stubs))throw Error('Unexpected import '+key);return stubs[key];},module,module.exports);
 return module.exports;
}
const DAY=86400000, now=new Date('2026-10-13T08:30:00Z');
let days=3;
const window=async()=>{const start=new Date(+now-days*DAY);return{days,start,end:now,createdAt:{gt:start}};};
const jobs=[
 {id:'new',userId:'owner',phoneId:'p',campaignId:'c',status:'SENT',createdAt:new Date(+now-DAY/2),sentAt:new Date(+now-DAY/4)},
 {id:'old-sent-recently',userId:'owner',phoneId:'p',campaignId:'old',status:'SENT',createdAt:new Date(+now-4*DAY),sentAt:new Date(+now-DAY/4)},
 {id:'boundary',userId:'owner',phoneId:'p',campaignId:'old',status:'QUEUED',createdAt:new Date(+now-3*DAY),sentAt:null},
 {id:'other',userId:'other',phoneId:'other',campaignId:'other',status:'FAILED',createdAt:new Date(+now-DAY/2),sentAt:null},
];
function matches(job,where){return Object.entries(where||{}).every(([key,value])=>{
 if(key==='createdAt'||key==='sentAt')return job[key] && Object.entries(value).every(([op,bound])=>({gt:job[key]>bound,gte:job[key]>=bound,lt:job[key]<bound,lte:job[key]<=bound})[op]);
 if(value && typeof value==='object')return value.in ? value.in.includes(job[key]) : job[key]===value;
 return job[key]===value;
});}
const filtered=where=>jobs.filter(j=>matches(j,where));
function grouped(by,rows){const result=[];for(const row of rows){let group=result.find(g=>by.every(key=>g[key]===row[key]));if(!group){group=Object.fromEntries(by.map(key=>[key,row[key]]));group._count={_all:0};result.push(group);}group._count._all++;}return result;}
const prisma={waDispatch:{count:async({where})=>filtered(where).length,findMany:async({where,skip=0,take=100})=>filtered(where).slice(skip,skip+take),groupBy:async({by,where})=>grouped(by,filtered(where))},
 phone:{count:async()=>1,groupBy:async()=>[{active:1,isOnline:true,_count:{_all:1}}],findMany:async()=>[{id:'p',name:'device',number:'synthetic'}]},
 campaign:{findFirst:async()=>({id:'c'}),findMany:async({where})=>[{id:'c'},{id:'old'},{id:'other'}].filter(c=>filtered({...where.dispatches.some,...(where.userId?{userId:where.userId}:{}),campaignId:c.id}).length),count:async args=>(await prisma.campaign.findMany(args)).length},
 $queryRaw:async(strings,...values)=>{
  assert(strings.join('?').includes('WHERE createdAt > ? AND sentAt >= ? AND sentAt < ?'));
  const [cutoff,start,end,scope]=values;
  const rows=filtered({createdAt:{gt:cutoff},sentAt:{gte:start,lt:end},...(scope.userId?{userId:scope.userId}:{})});
  const hourly=strings.join('').includes('HOUR(');
  return grouped([hourly?'hour':'day'],rows.map(j=>({...j,[hourly?'hour':'day']:hourly?new Date(+j.sentAt+7*3600000).getUTCHours():new Date(+j.sentAt+7*3600000).toISOString().slice(0,10)}))).map(g=>({...g,count:g._count._all}));
 }};
const base={'@/lib/prisma':{prisma},'@/middleware/apiAuthMiddleware':{default:h=>h},'@/lib/access':{ownerScope:user=>user.admin?{}:{userId:'owner'},isSuperAdmin:user=>!!user.admin},'@/server/dispatch/settings':{getDispatchDisplayWindow:window},'@/lib/tableQuery':load('src/lib/tableQuery.ts')};
const dashboard=load('src/pages/api/dashboard-stats.ts',{...base,'@/lib/dashboardStats':load('src/lib/dashboardStats.ts'),'@prisma/client':{Prisma:{empty:{},sql:(strings,userId)=>({userId})}}}).default;
const campaigns=load('src/pages/api/campaigns/index.ts',{...base,'@/server/dispatchWebhook/events':{},'@/server/campaigns/prepare':{},'@prisma/client':{CampaignStatus:{}}}).default;
const detail=load('src/pages/api/campaigns/[id].ts',{...base,'@/server/dispatchWebhook/events':{},'@/server/campaigns/prepare':{}}).default;
const reports=load('src/pages/api/reports.ts',{...base,'@prisma/client':{WaDispatchStatus:{SENT:'SENT',QUEUED:'QUEUED'}},zod:require('zod'),'@/server/campaigns/csv':{csv:rows=>rows}}).default;
const phones=load('src/pages/api/phones/index.ts',{...base,zod:require('zod'),'@/server/deviceWebhook/events':{}}).default;
async function request(handler,query={},admin=false){let body,code=200;const res={setHeader(){},status(value){code=value;return this;},json(value){body=value;},send(value){body=value;}};await handler({method:'GET',query,user:{id:'owner',admin}},res);return{body,code};}
(async()=>{
 const dates=load('src/lib/dashboardStats.ts').dashboardWindowDates(new Date('2026-10-10T08:30:00Z'),now);
 assert.deepEqual(dates,['2026-10-10','2026-10-11','2026-10-12','2026-10-13']);
 const format=load('src/lib/dispatchWindow.ts').formatDispatchWindow;
 assert(format({start:'2026-10-10T08:30:00Z',end:now.toISOString()}).includes('15.30'));
 for(days of [1,3,5])for(const admin of [false,true]){
  const eligible=filtered({createdAt:{gt:new Date(+now-days*DAY)},...(admin?{}:{userId:'owner'})});
  const {body:d}=await request(dashboard,{days:'30'},admin);
  assert.equal(d.period.days,days);assert.equal(+d.period.end-+d.period.start,days*DAY);
  assert.equal(Object.values(d.counts).reduce((s,n)=>s+n,0),eligible.length);
  assert.deepEqual(d.counts,d.periodCounts);
  const sent=eligible.filter(j=>j.sentAt).length;
  assert.equal(d.series.reduce((s,r)=>s+r.count,0),sent);assert.equal(d.hourly.reduce((s,r)=>s+r.count,0),sent);
  const {body:c}=await request(campaigns,{limit:'100'},admin);assert.equal(c.total,new Set(eligible.map(j=>j.campaignId)).size);
  for(const campaign of c.data)assert.equal(Object.values(campaign.counts).reduce((s,n)=>s+n,0),eligible.filter(j=>j.campaignId===campaign.id).length);
  const {body:h}=await request(detail,{id:'c',limit:'100'},admin);assert.equal(h.total,eligible.filter(j=>j.campaignId==='c').length);
  const {body:r}=await request(reports,{limit:'100'},admin);assert.equal(r.total,eligible.length);
  const {body:csv}=await request(reports,{export:'csv'},admin);assert.equal(csv.length,eligible.length+1);
  const {body:old}=await request(reports,{start:'2020-01-01',end:'2020-01-02'},admin);assert.equal(old.total,0);
  const {body:p}=await request(phones,{page:'1'},admin);assert.equal(p.data[0].sentCount,eligible.filter(j=>j.phoneId==='p'&&j.status==='SENT').length);
  assert.equal(p.data[0].sentCountDays,days);
 }
 assert.equal((await request(reports,{start:'invalid',end:'2020-01-02'})).code,400);
 console.log('PASS: settings 1/3/5, dashboard cards/charts, old recently sent exclusion, campaign list/history, reports/CSV, device counts, owner scope, rolling WIB dates and labels');
})().catch(error=>{console.error(error);process.exitCode=1;});
