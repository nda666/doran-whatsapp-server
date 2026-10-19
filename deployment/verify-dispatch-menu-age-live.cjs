const assert=require('node:assert/strict');
const fs=require('node:fs');
require('@next/env').loadEnvConfig(process.cwd(),false);
const {PrismaClient}=require('@prisma/client');
const db=new PrismaClient(),base='https://dashboard.jeblast.com';
const sum=counts=>Object.values(counts).reduce((n,c)=>n+c,0);
(async()=>{
 const admin=await db.user.findUniqueOrThrow({where:{email:'admin@gmail.com'}});
 const users=[admin,...await db.user.findMany({where:{approvalStatus:'APPROVED',isActive:true,id:{not:admin.id}},take:1})];
 const {getDispatchMaxAgeDays}=require('../dist/src/server/dispatch/settings');
 const days=await getDispatchMaxAgeDays();
 for(const user of users){
  const scope=user.id===admin.id?{}:{userId:user.id};
  async function get(path){const r=await fetch(base+path,{headers:{Authorization:'Bearer '+user.token},signal:AbortSignal.timeout(25000)});assert.equal(r.status,200,path);return r.json();}
  const d=await get('/api/dashboard-stats?days=30');
  assert.equal(d.period.days,days);const start=new Date(d.period.start),end=new Date(d.period.end);
  assert.equal(end-start,days*86400000);
  const where={...scope,createdAt:{gt:start}};
  assert.equal(sum(d.counts),await db.waDispatch.count({where}));
  assert.equal(sum(d.periodCounts),sum(d.counts));
  const sentWhere={...where,sentAt:{gte:start,lt:end}};
  const sent=await db.waDispatch.count({where:sentWhere});
  assert.equal(d.series.reduce((n,r)=>n+r.count,0),sent);assert.equal(d.hourly.reduce((n,r)=>n+r.count,0),sent);
  assert.equal(d.activeCampaigns,await db.campaign.count({where:{...scope,status:{in:['WAITING','PROCESSING','PAUSED']},dispatches:{some:{createdAt:{gt:start}}}}}));
  for(const row of d.topDevices)assert.equal(row.count,await db.waDispatch.count({where:{...sentWhere,phoneId:row.phoneId}}));
  const report=await get('/api/reports?limit=100&sort=createdAt&order=asc');
  assert.equal(report.display_window.days,days);
  const rw=report.display_window;
  assert(report.data.every(j=>new Date(j.createdAt)>new Date(rw.start)));
  assert.equal(report.total,await db.waDispatch.count({where:{...scope,createdAt:{gt:new Date(rw.start),lt:new Date(rw.end)}}}));
  const old=await get('/api/reports?start=2020-01-01&end=2020-01-02');assert.equal(old.total,0);
  const campaigns=await get('/api/campaigns?limit=100');assert.equal(campaigns.display_window.days,days);
  const cs=new Date(campaigns.display_window.start);
  assert.equal(campaigns.total,await db.campaign.count({where:{...scope,dispatches:{some:{createdAt:{gt:cs}}}}}));
  for(const c of campaigns.data){
   assert.equal(sum(c.counts),await db.waDispatch.count({where:{...scope,campaignId:c.id,createdAt:{gt:cs}}}));
   const detail=await get('/api/campaigns/'+c.id+'?limit=100');
   assert.equal(detail.total,await db.waDispatch.count({where:{...scope,campaignId:c.id,createdAt:{gt:new Date(detail.display_window.start)}}}));
  }
  const phones=await get('/api/phones?page=1&limit=100');
  for(const p of phones.data)assert.equal(p.sentCountDays,days);
  console.log('DISPATCH_MENU_AGE_SCOPE_OK',user.id===admin.id?'admin':'owner','days='+days,'dashboard/charts/campaign/history/reports/phones');
 }
 const manifest=JSON.parse(fs.readFileSync('.next/build-manifest.json','utf8'));
 const bundle=manifest.pages['/dashboard'].map(file=>fs.readFileSync('.next/'+file,'utf8')).join('\n');
 assert(bundle.includes('hari terakhir sesuai setting'));assert(!bundle.includes('total sepanjang waktu'));assert(!bundle.includes('Periode analitik'));
 console.log('DISPATCH_MENU_AGE_LIVE_OK: shared age window, WIB labels, fixed 7/30 selector removed');
})().catch(error=>{console.error('DISPATCH_MENU_AGE_LIVE_FAILED',error.message);process.exitCode=1;}).finally(()=>db.$disconnect());
