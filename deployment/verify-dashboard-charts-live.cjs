const assert = require('node:assert/strict');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const admin = await p.user.findFirst({ where: { email: 'admin@gmail.com', role: 'ADMIN', approvalStatus: 'APPROVED' } });
  assert(admin);
  const users = [admin, ...await p.user.findMany({ where: { approvalStatus: 'APPROVED', id: { not: admin.id } }, take: 1 })];
  for (const user of users) {
    const scope = user.id === admin.id ? {} : { userId: user.id };
    for (const days of [7, 30]) {
      const response = await fetch('https://dashboard.jeblast.com/api/dashboard-stats?days=' + days, { headers: { Authorization: 'Bearer ' + user.token } });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.series.length, days);
      assert.equal(body.hourly.length, 24);
      assert.equal(body.period.days, days);
      const start = new Date(body.period.start + 'T00:00:00+07:00');
      const end = new Date(new Date(body.period.end + 'T00:00:00+07:00').getTime() + 86400000);
      const total = await p.waDispatch.count({ where: { ...scope, sentAt: { gte: start, lt: end } } });
      assert.equal(body.series.reduce((n, r) => n + r.count, 0), total);
      assert.equal(body.hourly.reduce((n, r) => n + r.count, 0), total);
      assert.equal(Object.values(body.periodCounts).reduce((n, c) => n + c, 0), await p.waDispatch.count({ where: { ...scope, createdAt: { gte: start, lt: end } } }));
      assert.equal(body.deviceHealth.online + body.deviceHealth.offline + body.deviceHealth.inactive, await p.phone.count({ where: scope }));
      assert(body.topDevices.length <= 5);
      for (const row of body.topDevices) assert.equal(row.count, await p.waDispatch.count({ where: { ...scope, phoneId: row.phoneId, sentAt: { gte: start, lt: end } } }));
      console.log('DASHBOARD_TOTALS_AND_SCOPE_OK', user.id === admin.id ? 'admin' : 'user', days);
    }
  }
  const unauth = await fetch('https://dashboard.jeblast.com/api/dashboard-stats?days=7');
  assert.equal(unauth.status, 401);
  console.log('LIVE_DASHBOARD_CHARTS_PASSED_READ_ONLY');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => p.$disconnect());
