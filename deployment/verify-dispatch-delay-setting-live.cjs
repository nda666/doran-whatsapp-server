const assert=require('node:assert/strict'),fs=require('node:fs');
require('@next/env').loadEnvConfig(process.cwd());
const {PrismaClient}=require('@prisma/client');const db=new PrismaClient();
(async()=>{
 const admin=await db.user.findUniqueOrThrow({where:{email:'admin@gmail.com'}});
 const response=await fetch('https://dashboard.jeblast.com/api/admin/global-settings',{headers:{Authorization:'Bearer '+admin.token},signal:AbortSignal.timeout(20000)});assert.equal(response.status,200);
 const rows=await response.json(),row=rows.find(s=>s.key==='dispatch-random-delay');assert(row);
 const range=JSON.parse(row.value);assert(range.minSeconds>=1&&range.maxSeconds>=range.minSeconds&&range.maxSeconds<=30);
 const settings=require('../dist/src/server/dispatch/settings');assert.deepEqual(await settings.getDispatchDelayRange(),range);
 const manifest=JSON.parse(fs.readFileSync('.next/build-manifest.json','utf8'));const bundle=manifest.pages['/dashboard/admin'].map(f=>fs.readFileSync('.next/'+f,'utf8')).join('\n');
 for(const text of ['Mulai (detik)','Hingga (detik)','dispatch-random-delay'])assert(bundle.includes(text),text);
 const r=await fetch('http://127.0.0.1:3000/health/dispatch',{headers:{Authorization:'Bearer '+admin.token}});const health=await r.json();assert(health.metrics.running&&!health.alerts.includes('POLL_STALE'));
 console.log('DISPATCH_DELAY_SETTING_LIVE_PASSED',JSON.stringify({range,workerRunning:health.metrics.running,alerts:health.alerts}));await require('../dist/src/lib/prisma').prisma.$disconnect();
})().catch(e=>{console.error(e.code||e.message);process.exitCode=1}).finally(()=>db.$disconnect());
