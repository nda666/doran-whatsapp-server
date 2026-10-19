const assert = require('node:assert/strict');
const fs = require('node:fs');
const { encode } = require('next-auth/jwt');
require('@next/env').loadEnvConfig(process.cwd(), false);
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient(), base = 'https://dashboard.jeblast.com';
(async () => {
 const admin = await db.user.findUniqueOrThrow({where:{email:'admin@gmail.com'}});
 for (const status of ['QUEUED','FAILED']) {
  const response = await fetch(base+'/api/dispatch?limit=100&status='+status,{headers:{Authorization:'Bearer '+admin.token},signal:AbortSignal.timeout(25000)});
  assert.equal(response.status,200); const body=await response.json();
  assert(body.data.every(job=>job.status===status));
 }
 const cookie='__Secure-next-auth.session-token='+await encode({token:{id:admin.id,token:admin.token,email:admin.email,sessionVersion:admin.sessionVersion},secret:process.env.NEXTAUTH_SECRET});
 const response=await fetch(base+'/dashboard/dispatch',{headers:{Cookie:cookie},signal:AbortSignal.timeout(25000)});
 assert.equal(response.status,200);const html=await response.text();
 assert(html.includes('Menunggu pengiriman')); assert(!html.includes('Selain gagal'));
 const manifest=JSON.parse(fs.readFileSync('.next/build-manifest.json','utf8'));
 const bundle=manifest.pages['/dashboard/dispatch'].map(file=>fs.readFileSync('.next/'+file,'utf8')).join('\n');
 assert(!bundle.includes('NOT_FAILED'));assert(!bundle.includes('Selain gagal'));
 assert((bundle.match(/status:"QUEUED"/g)||[]).length>=2);
 console.log('DISPATCH_QUEUED_LIVE_OK: default QUEUED in query/form, removed Selain gagal, queued/failed API filters verified');
})().catch(error=>{console.error('DISPATCH_QUEUED_LIVE_FAILED',error.message);process.exitCode=1;}).finally(()=>db.$disconnect());
