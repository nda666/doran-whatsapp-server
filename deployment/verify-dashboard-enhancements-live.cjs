const assert = require('node:assert/strict'),fs = require('node:fs');
require('@next/env').loadEnvConfig(process.cwd());
const {PrismaClient}=require('@prisma/client'),db=new PrismaClient();
const {defaultDispatchDates,dispatchDateFilter}=require('../dist/src/lib/dispatchDateFilter');
const base='https://dashboard.jeblast.com';
(async()=>{
 const admin=await db.user.findFirstOrThrow({where:{email:'admin@gmail.com',role:'ADMIN'}});
 const ordinary=await db.user.findFirst({where:{role:'USER',approvalStatus:'APPROVED',isActive:true}});
 const range=defaultDispatchDates(),dateFilter=dispatchDateFilter(range.start_date,range.end_date);
 for(const user of [admin,ordinary].filter(Boolean)) {
  const headers={Authorization:'Bearer '+user.token},scope=user===admin?{}:{userId:user.id};
  const get=async path=>{const r=await fetch(base+path,{headers});assert.equal(r.status,200,path);return r.json();};
  const log=await get('/api/log?'+new URLSearchParams({...range,limit:'100'}));
  assert.equal(log.totalData,await db.inboxMessage.count({where:{...scope,receivedAt:dateFilter}}));
  assert(log.data.every(row=>new Date(row.receivedAt)>=dateFilter.gte&&new Date(row.receivedAt)<dateFilter.lt));
  assert.equal((await fetch(base+'/api/log?start_date=2026-02-30&end_date=2026-03-01',{headers})).status,400);
  for(const endpoint of ['contacts','media']) {
   const data=await get('/api/'+endpoint+'?sort=createdAt&order=desc&limit=100');
   assert(data.data.every(row=>row.createdAt&&Number.isFinite(Date.parse(row.createdAt))));
   assert(data.data.every((row,i)=>!i||Date.parse(data.data[i-1].createdAt)>=Date.parse(row.createdAt)));
  }
  const stats=await get('/api/dashboard-stats');
  const start=new Date(stats.period.start),end=new Date(stats.period.end);
  const where={...scope,createdAt:{gt:start},sentAt:{gte:start,lt:end}};
  const total=await db.waDispatch.count({where});
  assert.equal(stats.series.reduce((sum,row)=>sum+row.count,0),total);
  assert.equal(stats.hourly.reduce((sum,row)=>sum+row.count,0),total);
  const grouped=await db.$queryRawUnsafe('SELECT HOUR(DATE_ADD(sentAt, INTERVAL 7 HOUR)) AS hour, COUNT(*) AS count FROM wa_dispatches WHERE createdAt > ? AND sentAt >= ? AND sentAt < ?'+(user===admin?'':' AND userId = ?')+' GROUP BY hour',start,start,end,...(user===admin?[]:[user.id]));
  for(const row of stats.hourly)assert.equal(row.count,Number(grouped.find(item=>Number(item.hour)===row.hour)?.count||0));
 }
 const manifest=JSON.parse(fs.readFileSync('.next/build-manifest.json','utf8'));
 for(const page of ['/dashboard','/dashboard/log','/dashboard/contacts','/dashboard/media']) {
  const bundle=manifest.pages[page].map(file=>fs.readFileSync('.next/'+file,'utf8')).join('\n');
  if(page==='/dashboard'){assert(bundle.includes('data-chart-value'));assert(bundle.includes('bukan rata-rata harian'));assert(bundle.includes('09:00'));
  }else if(page==='/dashboard/log'){assert(bundle.includes('Tanggal mulai')&&bundle.includes('Tanggal selesai'));
  }else assert(bundle.includes('Dibuat (WIB)'));
 }
 console.log('DASHBOARD_ENHANCEMENTS_LIVE_OK: log dates and counts, contact/media timestamps and sorting, hourly totals per WIB hour against DB, chart labels and explanatory copy');
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>db.$disconnect());
