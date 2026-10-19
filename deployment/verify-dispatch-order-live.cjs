const assert = require('node:assert/strict'), fs = require('node:fs');
require('@next/env').loadEnvConfig(process.cwd(), false);
const { PrismaClient } = require('@prisma/client'); const db = new PrismaClient();
(async () => {
  const admin = await db.user.findUniqueOrThrow({ where: { email: 'admin@gmail.com' } });
  const response = await fetch('https://dashboard.jeblast.com/api/admin/global-settings', { headers: { Authorization: 'Bearer '+admin.token }, signal: AbortSignal.timeout(20000) });
  assert.equal(response.status,200);
  const rows = await response.json(); const order = rows.find(s=>s.key==='dispatch-queue-order');
  assert(order && ['oldest','newest'].includes(order.value));
  const settings = require('../dist/src/server/dispatch/settings');
  assert.equal(await settings.getDispatchQueueOrder(), order.value);
  const manifest = JSON.parse(fs.readFileSync('.next/build-manifest.json','utf8'));
  const bundle = manifest.pages['/dashboard/admin'].map(f=>fs.readFileSync('.next/'+f,'utf8')).join('\n');
  for (const text of ['dispatch-queue-order','Data terlama dahulu','Data terbaru dahulu']) assert(bundle.includes(text),text);
  const healthResponse=await fetch('http://127.0.0.1:3000/health/dispatch',{headers:{Authorization:'Bearer '+admin.token}});
  const health=await healthResponse.json(); assert(health.metrics.running); assert(!health.alerts.includes('POLL_STALE'));
  console.log('DISPATCH_ORDER_LIVE_PASSED',JSON.stringify({order:order.value,healthStatus:healthResponse.status,alerts:health.alerts,connected:health.metrics.connected_socket_count}));
  await require('../dist/src/lib/prisma').prisma.$disconnect();
})().catch(e=>{console.error(e.code||e.message);process.exitCode=1}).finally(()=>db.$disconnect());
