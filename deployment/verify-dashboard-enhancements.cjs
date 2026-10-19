const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript');
function load(file, stubs={}) {
 const module = {exports:{}};
 const code = ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:1,target:7,jsx:4,esModuleInterop:true}}).outputText;
 new Function('require','module','exports',code)(name=>name in stubs?stubs[name]:require(name),module,module.exports);
 return module.exports;
}
const dates = load('src/lib/dispatchDateFilter.ts');
const jobs = [
 ['before','2026-10-11T16:59:59.999Z','owner'],['start','2026-10-11T17:00:00Z','owner'],
 ['end','2026-10-14T16:59:59.999Z','owner'],['after','2026-10-14T17:00:00Z','owner'],
 ['other','2026-10-13T12:00:00Z','other'],
].map(([id,time,userId])=>({id,receivedAt:new Date(time),sentAt:new Date('2020-01-01'),userId,sender:'Alice',recipient:'Bob'}));
const match = where=>jobs.filter(job=>job.userId===where.userId && (!where.receivedAt || job.receivedAt>=where.receivedAt.gte&&job.receivedAt<where.receivedAt.lt) && (!where.sender||job.sender.includes(where.sender.contains)) && (!where.recipient||job.recipient.includes(where.recipient.contains)));
const handler=load('src/pages/api/log/index.ts',{
 '@/lib/tableQuery':load('src/lib/tableQuery.ts'), '@/lib/access':{ownerScope:()=>({userId:'owner'})},
 '@/lib/prisma':{prisma:{inboxMessage:{findMany:async({where,skip,take})=>match(where).slice(skip,skip+take),count:async({where})=>match(where).length}}},
 '@/middleware/apiAuthMiddleware':{__esModule:true,default:fn=>fn},'@/lib/dispatchDateFilter':dates,
}).default;
async function request(query,expected=200) {
 let body;await handler({method:'GET',user:{},query},{setHeader(){},status(code){assert.equal(code,expected);return this;},json(value){body=value;}});return body;
}
(async()=>{
 const range={start_date:'2026-10-12',end_date:'2026-10-14'};
 let body=await request(range);assert.equal(body.totalData,2);assert.deepEqual(body.data.map(job=>job.id),['start','end']);
 body=await request({...range,sender:'Ali',recipient:'Bob',limit:'1',page:'2'});assert.equal(body.totalData,2);assert.equal(body.data[0].id,'end');
 body=await request({...range,sender:'missing'});assert.equal(body.totalData,0);
 body=await request({});assert.equal(body.totalData,4);
 for(const query of [{start_date:'2026-02-30',end_date:'2026-03-01'},{start_date:range.start_date},{start_date:'2026-10-15',end_date:range.end_date}])assert((await request(query,400)).message);
 const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
 const {ActivityChart}=load('src/components/DashboardCharts.tsx');
 const items=[{label:'12/10/26',count:0,color:'#1677ff'},{label:'13/10/26',count:1234,color:'#1677ff'},{label:'14/10/26',count:42,color:'#1677ff'}];
 const html=renderToStaticMarkup(React.createElement(ActivityChart,{items,label:'Pengiriman',showValues:true}));
 assert.equal((html.match(/data-chart-value=/g)||[]).length,3);assert(html.includes('>1.234</text>')&&html.includes('>42</text>')&&html.includes('>0</text>'));
 console.log('DASHBOARD_ENHANCEMENTS_OK: log received-date boundaries, owner scope, search, pagination, validation and visible bar values');
})().catch(error=>{console.error(error);process.exitCode=1;});
