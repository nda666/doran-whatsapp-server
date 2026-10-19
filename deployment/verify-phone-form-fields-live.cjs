require('@next/env').loadEnvConfig(process.cwd());
const assert = require('node:assert/strict');
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const url = 'http://127.0.0.1:3000';
(async () => {
  const admin = await db.user.findFirstOrThrow({ where: { email: 'admin@gmail.com', role: 'ADMIN', approvalStatus: 'APPROVED', isActive: true } });
  const headers = { Authorization: `Bearer ${admin.token}`, 'Content-Type': 'application/json' };
  const response = await fetch(url + '/api/admin/global-settings', { headers });
  assert.equal(response.status, 200);
  const rows = await response.json();
  const setting = rows.find(row => row.key === 'device-form-visible-fields');
  assert(setting);
  assert.equal(JSON.parse(setting.value).length, 6);
  const stored = await db.globalSetting.findUniqueOrThrow({ where: { id: setting.id } });
  assert(stored.value.startsWith('enc-v1:'));
  const read = await fetch(url + '/api/phones/form-fields', { headers });
  assert.equal(read.status, 200);
  assert.deepEqual((await read.json()).fields, JSON.parse(setting.value));
  const invalid = await fetch(url + '/api/admin/global-settings', { method: 'PATCH', headers, body: JSON.stringify({ id: setting.id, key: setting.key, label: setting.label, value: '["unknown"]' }) });
  assert.equal(invalid.status, 400);
  assert.equal((await fetch(url + '/api/phones/form-fields')).status, 401);
  const regular = await db.user.findFirst({ where: { role: 'USER', approvalStatus: 'APPROVED', isActive: true } });
  if (regular) {
    const userHeaders = { Authorization: `Bearer ${regular.token}` };
    assert.equal((await fetch(url + '/api/phones/form-fields', { headers: userHeaders })).status, 200);
    assert.equal((await fetch(url + '/api/admin/global-settings', { headers: userHeaders })).status, 403);
  }
  assert.equal(await db.phone.count({ where: { OR: [{ readReceipt: true }, { showTyping: true }] } }), 0);
  console.log('LIVE_PHONE_FORM_FIELDS_OK: seeded global option, encrypted storage, authenticated visibility, invalid updates rejected, admin restriction, read receipt and typing still off');
})().catch(error => { console.error(error.name, error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
