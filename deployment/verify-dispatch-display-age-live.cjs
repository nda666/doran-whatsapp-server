const assert = require('node:assert/strict');
const fs = require('node:fs');
require('@next/env').loadEnvConfig(process.cwd(), false);
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient(), base = 'https://dashboard.jeblast.com';
(async () => {
 const admin = await db.user.findUniqueOrThrow({where:{email:'admin@gmail.com'}});
 const { getDispatchMaxAgeDays } = require('../dist/src/server/dispatch/settings');
 const days = await getDispatchMaxAgeDays();
 let all;
 for (const status of ['', 'QUEUED','PROCESSING','SENT','DELIVERED','READ','FAILED','UNCERTAIN']) {
  const before = Date.now();
  const response = await fetch(base+'/api/dispatch?limit=100&sort=created_at&order=asc&status='+status,{headers:{Authorization:'Bearer '+admin.token},signal:AbortSignal.timeout(25000)});
  assert.equal(response.status,200); const body=await response.json();
  assert.equal(body.max_age_days,days);
  const cutoff = new Date(body.display_cutoff).getTime();
  assert(cutoff>=before-days*86400000 && cutoff<=Date.now()-days*86400000);
  assert(body.data.every(job=>new Date(job.created_at).getTime()>cutoff));
  if(status) assert(body.data.every(job=>job.status===status)); else all=body;
  assert(body.total>=body.data.length);
  if (!status) assert.equal(Object.values(body.counts).reduce((sum,value)=>sum+value,0),body.total);
 }
 const cutoff=new Date(all.display_cutoff);
 const older=await db.waDispatch.count({where:{createdAt:{lte:cutoff}}});
 const manifest=JSON.parse(fs.readFileSync('.next/build-manifest.json','utf8'));
 const bundle=manifest.pages['/dashboard/dispatch'].map(file=>fs.readFileSync('.next/'+file,'utf8')).join('\n');
 assert(bundle.includes('max_age_days'));assert(bundle.includes('hari terakhir sejak masuk antrean'));
 console.log('DISPATCH_DISPLAY_AGE_LIVE_OK: days='+days+', all status lists within age window, summary matches total, older records retained='+older);
})().catch(error=>{console.error('DISPATCH_DISPLAY_AGE_LIVE_FAILED',error.message);process.exitCode=1;}).finally(()=>db.$disconnect());
