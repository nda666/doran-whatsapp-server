const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const { enqueueDeviceEvent, updateDevice } = require('../dist/src/server/deviceWebhook/events');
const abort = new Error('ROLLBACK_WEBHOOK_TEST');
let testUserId;
(async () => {
  const phoneCount = await p.phone.count(), eventCount = await p.deviceWebhookEvent.count();
  const configBefore = await p.deviceWebhookSetting.findUniqueOrThrow({ where: { id: 1 } });
  assert.equal(configBefore.enabled, false, 'Run before initial activation only; never replace an active webhook for testing');
  try {
    await p.$transaction(async tx => {
      await tx.deviceWebhookSetting.update({ where: { id: 1 }, data: { enabled: true, url: 'https://cashier.example.invalid/hook', secret: randomUUID(), revision: randomUUID() } });
      const owner = await tx.user.create({ data: { email: `webhook-test-${randomUUID()}@example.invalid`, password: randomUUID(), token: randomUUID(), name: 'ROLLBACK TEST' } });
      testUserId = owner.id;
      const phone = await tx.phone.create({ data: { userId: owner.id, name: 'ROLLBACK TEST DEVICE', active: 0 } });
      await enqueueDeviceEvent(tx, 'device.created', phone);
      await updateDevice(tx, { id: phone.id, userId: owner.id }, { name: 'Updated' });
      await updateDevice(tx, { id: phone.id }, { name: 'Updated' });
      const updated = await updateDevice(tx, { id: phone.id }, { token: randomUUID() }, 'device.token_rotated');
      await updateDevice(tx, { id: phone.id }, { active: 1 }, 'device.active_changed');
      const events = await tx.deviceWebhookEvent.findMany({ where: { deviceId: phone.id }, orderBy: { id: 'asc' } });
      assert.deepEqual(events.map(row => row.event), ['device.created', 'device.updated', 'device.token_rotated', 'device.active_changed']);
      assert.equal(JSON.parse(events[2].payload).device.token, updated.token);
      assert.equal(await updateDevice(tx, { id: phone.id, userId: randomUUID() }, { token: randomUUID() }), null);
      await tx.phone.delete({ where: { id: phone.id } });
      await enqueueDeviceEvent(tx, 'device.deleted', updated);
      assert.equal(await tx.deviceWebhookEvent.count({ where: { deviceId: phone.id } }), 5);
      throw abort;
    }, { timeout: 30000 });
  } catch (error) { if (error !== abort) throw error; }
  assert.equal(await p.phone.count(), phoneCount);
  assert.equal(await p.deviceWebhookEvent.count(), eventCount);
  assert.equal(await p.user.count({ where: { id: testUserId } }), 0);
  assert.deepEqual(await p.deviceWebhookSetting.findUniqueOrThrow({ where: { id: 1 } }), configBefore);
  console.log('DEVICE_WEBHOOK_REAL_DB_ROLLBACK_OK: synthetic uncommitted fixtures only; no existing device/token changed; no webhook sent');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => p.$disconnect());
