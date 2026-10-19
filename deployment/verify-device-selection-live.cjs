const assert = require('node:assert/strict');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const owner = await p.user.findFirst({ where: { role: 'ADMIN' } });
  assert(owner);
  const { encode } = require('next-auth/jwt');
  const jwt = await encode({ token: { id: owner.id, token: owner.token, name: owner.name, email: owner.email }, secret: process.env.NEXTAUTH_SECRET });
  for (const route of ['phone', 'campaigns', 'dispatch', 'auto-reply']) {
    const response = await fetch('https://dashboard.jeblast.com/dashboard/' + route, {
      redirect: 'manual', headers: { Cookie: '__Secure-next-auth.session-token=' + jwt },
    });
    assert.equal(response.status, 200, route);
    const html = await response.text();
    assert(!html.includes('class="sidebar-device"'), 'Global device picker still present');
    if (route === 'dispatch') assert(html.includes('Perangkat pengirim'), 'Dispatch picker missing');
    if (route === 'auto-reply') {
      assert(html.includes('auto-reply-device'), 'Auto-reply picker missing');
      assert(html.includes('Pilih perangkat untuk melihat dan mengelola auto-reply.'), 'Missing empty-selection guidance');
    }
    console.log('PAGE_LOCAL_DEVICE_SELECTION_OK', route);
  }
  const devices = await p.phone.findMany({ where: { userId: owner.id }, take: 2, select: { id: true } });
  assert.equal(devices.length, 2);
  for (const device of devices) {
    const response = await fetch('http://127.0.0.1:3000/api/auto_reply?phone_id=' + device.id, {
      headers: { Authorization: 'Bearer ' + owner.token },
    });
    assert.equal(response.status, 200);
    const rows = await response.json();
    assert(Array.isArray(rows));
    assert(rows.every(row => row.phoneId === device.id), 'Replies from another device returned');
    const queue = await fetch('http://127.0.0.1:3000/api/dispatch?phone_id=' + device.id, {
      headers: { Authorization: 'Bearer ' + owner.token },
    });
    assert.equal(queue.status, 200);
    const result = await queue.json();
    const expected = await p.waDispatch.count({ where: { userId: owner.id, phoneId: device.id } });
    assert.equal(result.total, expected, 'Device queue filter count mismatch');
  }
  console.log('TWO_DEVICE_READ_ONLY_FILTER_CHECKS_OK');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => p.$disconnect());
