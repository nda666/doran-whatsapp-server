const assert = require('node:assert/strict');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
(async () => {
  const owner = await db.user.findUniqueOrThrow({ where: { email: 'admin@gmail.com' } });
  const base = 'https://dashboard.jeblast.com';
  const headers = { Authorization: 'Bearer ' + owner.token };
  for (const active of ['', 'true', 'false']) {
    for (const status of ['', 'APPROVED', 'PENDING']) {
      const response = await fetch(base+'/api/admin/users?'+new URLSearchParams({active,status,limit:'100'}), {headers});
      assert.equal(response.status,200);
      const result = await response.json();
      const where = {...(active ? {isActive:active==='true'} : {}), ...(status ? {approvalStatus:status} : {})};
      assert.equal(result.total,await db.user.count({where}));
      assert(result.data.every(user=>(!active || user.isActive===(active==='true')) && (!status || user.approvalStatus===status)));
    }
  }
  const response = await fetch(base+'/api/admin/users?active=true&q='+encodeURIComponent(owner.email), {headers});
  const result = await response.json();assert.equal(result.total,1);assert.equal(result.data[0].id,owner.id);
  assert.equal((await fetch(base+'/api/admin/users?active=invalid',{headers})).status,400);
  console.log('USER_ACTIVE_FILTER_LIVE_OK: all/active/inactive, combined approval and text search, matching totals, invalid filter');
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>db.$disconnect());
