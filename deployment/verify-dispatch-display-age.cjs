const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
function load(name, stubs) {
 const module = { exports: {} };
 const code = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', name), 'utf8'), { compilerOptions: { module: 1, target: 7 } }).outputText;
 new Function('require','module','exports',code)(key => { if (!(key in stubs)) throw Error('Unexpected import '+key); return stubs[key]; }, module, module.exports);
 return module.exports;
}
const DAY = 86400000, now = Date.now();
Date.now = () => now;
let days = 3;
const statuses = ['QUEUED','PROCESSING','SENT','DELIVERED','READ','FAILED','UNCERTAIN'];
const jobs = statuses.flatMap(status => [
 {id: status+'-recent', userId:'owner', status, createdAt:new Date(now-DAY), updatedAt:new Date(now), storeId:'store'},
 {id: status+'-old', userId:'owner', status, createdAt:new Date(now-4*DAY), updatedAt:new Date(now), storeId:'store'},
 {id: status+'-boundary', userId:'owner', status, createdAt:new Date(now-3*DAY)},
 {id: status+'-other', userId:'other', status, createdAt:new Date(now-DAY)},
]);
const match = where => jobs.filter(job => job.userId === where.userId && job.createdAt > where.createdAt.gt && (!where.createdAt.gte || job.createdAt >= where.createdAt.gte) && (!where.createdAt.lt || job.createdAt < where.createdAt.lt) && (!where.status || job.status === where.status) && (!where.storeId || job.storeId === where.storeId) && (!where.AND || where.AND.every(item => typeof item.storeId === 'string' ? job.storeId === item.storeId : job.storeId !== item.storeId.not)) && (!where.OR || where.OR.some(item => item.id === job.id)));
const prisma = { phone: { findMany: async () => [] }, waDispatch: {
 count: async ({where}) => match(where).length,
 findMany: async ({where, skip, take}) => match(where).slice(skip, skip+take),
 groupBy: async ({where}) => statuses.map(status => ({status, _count:{_all:where.status && where.status !== status ? 0 : match({...where,status}).length}})),
} };
const constants = load('src/lib/dispatchSettings.ts', {});
const dates = load('src/lib/dispatchDateFilter.ts', {});
const handler = load('src/pages/api/dispatch.ts', {
 '@/lib/tableQuery':load('src/lib/tableQuery.ts',{}), '@/lib/access':{ownerScope:()=>({userId:'owner'})},
 '@/middleware/apiAuthMiddleware':{default:fn=>fn}, '@/lib/prisma':{prisma},
 '@/server/dispatch/queue':{dispatchSummary:job=>({...job, created_at:job.createdAt}),requestJobId:value=>value.job_id,requestJobKey:()=>'',DispatchError:class extends Error{}},
 '@prisma/client':{WaDispatchStatus:Object.fromEntries(statuses.map(value=>[value,value]))},
 '@/lib/dispatchPresentation':{dispatchWaitingReason:()=>null},
 '@/server/dispatch/settings':{getDispatchMaxAgeDays:async()=>days}, '@/lib/dispatchSettings':constants,
 '@/lib/dispatchDateFilter':dates,
}).default;
async function request(query={}, expectedStatus=200) {
 let body;
 const res={setHeader(){},status(code){assert.equal(code,expectedStatus);return this;},json(value){body=value;return this;}};
 await handler({method:'GET',user:{},query:{limit:'100',...query}},res);
 return body;
}
(async()=>{
 let body=await request(); assert.equal(body.total,7); assert.equal(body.data.length,7);
 assert.equal(body.max_age_days,3); assert.equal(body.display_cutoff.getTime(),now-3*DAY);
 assert(statuses.every(status=>body.counts[status]===1));
 for(const status of statuses){body=await request({status});assert.equal(body.total,1);assert.equal(body.data[0].id,status+'-recent');}
 body=await request({store_id:'missing'});assert.equal(body.total,0);assert.equal(body.counts.SENT,1);
 body=await request({job_id:'SENT-old'});assert.equal(body.total,0);
 body=await request({limit:'2',page:'2'});assert.equal(body.total,7);assert.equal(body.data.length,2);
 days=5;body=await request();assert.equal(body.total,21);assert.equal(body.max_age_days,5);assert(statuses.every(status=>body.counts[status]===3));
 days=1;body=await request();assert.equal(body.total,0);assert(statuses.every(status=>body.counts[status]===0));
 assert.deepEqual(dates.defaultDispatchDates(Date.parse('2026-10-13T18:00:00Z')), {start_date:'2026-10-12',end_date:'2026-10-14'});
 assert.deepEqual(dates.defaultDispatchDates(Date.parse('2026-01-01T00:00:00Z')), {start_date:'2025-12-30',end_date:'2026-01-01'});
 const range={start_date:'2026-10-12',end_date:'2026-10-14'};
 assert.equal(dates.dispatchDateFilter(range.start_date,range.end_date).gte.toISOString(),'2026-10-11T17:00:00.000Z');
 assert.equal(dates.dispatchDateFilter(range.start_date,range.end_date).lt.toISOString(),'2026-10-14T17:00:00.000Z');
 days=3650; jobs.splice(0,jobs.length,...[
  ['before','2026-10-11T16:59:59.999Z','owner'],['start','2026-10-11T17:00:00Z','owner'],
  ['end','2026-10-14T16:59:59.999Z','owner'],['after','2026-10-14T17:00:00Z','owner'],
  ['other','2026-10-13T12:00:00Z','other'],
 ].map(([id,time,userId])=>({id,createdAt:new Date(time),status:'SENT',userId,storeId:'store'})));
 body=await request(range);assert.equal(body.total,2);assert.deepEqual(body.data.map(job=>job.id),['start','end']);assert.equal(body.counts.SENT,2);
 body=await request({...range,status:'QUEUED'});assert.equal(body.total,0);assert.equal(body.counts.SENT,2);
 body=await request({...range,store_id:'missing'});assert.equal(body.total,0);assert.equal(body.counts.SENT,2);
 body=await request({...range,limit:'1',page:'2'});assert.equal(body.total,2);assert.equal(body.data.length,1);
 jobs.find(job=>job.id==='end').storeId='default';
 body=await request({...range,store_filter:'non_default'});assert.equal(body.total,1);assert.deepEqual(body.data.map(job=>job.id),['start']);assert.equal(body.counts.SENT,2);
 body=await request({...range,store_filter:'default'});assert.equal(body.total,1);assert.deepEqual(body.data.map(job=>job.id),['end']);
 body=await request({...range,store_filter:'non_default',store_id:'default'});assert.equal(body.total,0);
 body=await request({...range,store_filter:'non_default',store_id:'store',status:'SENT',limit:'1'});assert.equal(body.total,1);
 body=await request({...range,store_filter:'non_default',status:'QUEUED'});assert.equal(body.total,0);
 body=await request({...range,store_filter:''});assert.equal(body.total,2);
 body=await request({...range,summary_filtered:'1',status:'QUEUED'});assert.equal(body.total,0);assert.equal(body.counts.SENT,0);
 body=await request({...range,summary_filtered:'1',store_id:'missing'});assert.equal(body.total,0);assert.equal(body.counts.SENT,0);
 body=await request({...range,summary_filtered:'1',store_filter:'non_default'});assert.equal(body.total,1);assert.equal(body.counts.SENT,1);
 body=await request({...range,summary_filtered:'1',status:'SENT',limit:'1',page:'2'});assert.equal(body.total,2);assert.equal(body.counts.SENT,2);assert.equal(body.data.length,1);
 body=await request({...range,status:'QUEUED'});assert.equal(body.total,0);assert.equal(body.counts.SENT,2); // Fresh page restores the default summary.
 for(const query of [{start_date:'2026-02-30',end_date:'2026-03-01'},{start_date:[],end_date:range.end_date},{start_date:'14/10/2026',end_date:range.end_date},{start_date:'2026-10-15',end_date:range.end_date},{start_date:range.start_date},{end_date:range.end_date}]) {
  body=await request(query,400);assert(body.message);
 }
 assert.equal(dates.dispatchDateFilter('2024-02-29','2024-02-29').lt.toISOString(),'2024-02-29T17:00:00.000Z');
 console.log('PASS: WIB dates, inclusive start/end days, invalid dates, reversed range, status/search composition, owner isolation, summary and pagination');
 console.log('PASS: age boundary, all statuses, owner isolation, search, pagination, summary and dynamic setting changes');
})().catch(error=>{console.error(error);process.exitCode=1;});
