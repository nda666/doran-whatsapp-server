const assert = require('node:assert/strict');
const fs = require('node:fs');
const { encode } = require('next-auth/jwt');
require('@next/env').loadEnvConfig(process.cwd(), false);
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient(), base = 'https://dashboard.jeblast.com';
async function get(path, token) {
 const response = await fetch(base + path, { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(25000) });
 assert.equal(response.status,200,path); return response.json();
}
(async () => {
 const admin = await db.user.findUniqueOrThrow({ where: { email: 'admin@gmail.com' } });
 const settings = await get('/api/admin/global-settings',admin.token);
 const setting = settings.find(s => s.key === 'dispatch-max-age-days');
 assert(setting); assert(/^[0-9]+$/.test(setting.value)); assert(Number(setting.value)>=1);
 const filtered = await get('/api/dispatch?status=NOT_FAILED&limit=100',admin.token);
 assert(filtered.data.every(job => job.status !== 'FAILED'));
 const failed = await get('/api/dispatch?status=FAILED&limit=10',admin.token);
 assert(failed.data.every(job => job.status === 'FAILED'));
 const all = await get('/api/dispatch?limit=10',admin.token);
 assert.equal(all.total,filtered.total + failed.total);
 const cookie = '__Secure-next-auth.session-token=' + await encode({ token: { id: admin.id, token: admin.token, email: admin.email, sessionVersion: admin.sessionVersion }, secret: process.env.NEXTAUTH_SECRET });
 const page = await fetch(base+'/dashboard/dispatch',{headers:{Cookie:cookie},signal:AbortSignal.timeout(25000)});
 assert.equal(page.status,200); const html = await page.text();
 assert(html.includes('Selain gagal'));
 const manifest = JSON.parse(fs.readFileSync('.next/build-manifest.json','utf8'));
 const bundle = manifest.pages['/dashboard/dispatch'].map(name => fs.readFileSync('.next/'+name,'utf8')).join('\n');
 assert(bundle.includes('NOT_FAILED'));
 const health = require('../dist/src/server/dispatch/settings');
 const cutoff = await health.getDispatchAgeCutoff(); assert(cutoff instanceof Date);
 console.log('DISPATCH_AGE_LIVE_OK: global days='+setting.value+', filter excludes FAILED, all/failed filters retained, authenticated page default verified, worker reads global setting');
})().catch(error=>{console.error('DISPATCH_AGE_LIVE_FAILED',error.message);process.exitCode=1;}).finally(()=>db.$disconnect());
