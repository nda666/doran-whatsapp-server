const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const id = randomUUID();
let created = false;
(async () => {
  const owner = await db.user.findFirstOrThrow({ where: { role: 'ADMIN', email: 'admin@gmail.com' } });
  const phone = await db.phone.findFirstOrThrow({ where: { userId: owner.id } });
  const hash = createHash('sha256').update(id).digest('hex');
  // A terminal synthetic row cannot be claimed by the WhatsApp sender.
  const job = await db.waDispatch.create({ data: { id, userId: owner.id, phoneId: phone.id,
    storeId: 'webhook-manual-test', transactionId: 'webhook-manual-test-' + id,
    messageKey: 'endpoint-test', recipient: '6280000000000', dedupeKey: hash, payloadHash: hash,
    message: '', status: 'FAILED', lastError: 'SYNTHETIC_TEST', expiresAt: new Date(Date.now() + 3600000) } });
  created = true;
  for (const status of ['DELIVERED', 'READ']) {
    const response = await fetch('https://dashboard.jeblast.com/api/dispatch-webhook', {
      method: 'POST', headers: { Authorization: 'Bearer ' + owner.token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }), signal: AbortSignal.timeout(25000) });
    const result = await response.json();
    assert.equal(response.status, 200, result.message);
    assert.equal(result.status, status);
    assert.equal(result.details.mode, 'sent');
    assert.equal(result.details.response.status, 200);
    assert.equal(result.details.request.body.dispatch.status, status);
    assert.equal(result.details.request.body.event_id, result.event_id);
    const config = await db.dispatchWebhookSetting.findUnique({ where: { id: 1 } });
    const device = await db.deviceWebhookSetting.findUnique({ where: { id: 1 } });
    const secret = (config?.url === result.details.request.url ? config.secret : '') || (device?.url === 'https://kasir.doran.id/api/webhooks/jeblast/wa-phone' ? device.secret : '');
    assert(result.details.request.headers.Authorization === 'Bearer ' + secret, 'Authorization must match the existing cashier key');
    const receipt = JSON.parse(result.details.response.body);
    assert.equal(receipt.messages_updated ?? receipt.data?.messages_updated, 0, 'Synthetic event must not update customer messages');
    const event = await db.dispatchWebhookEvent.findUniqueOrThrow({ where: { eventId: result.event_id } });
    assert.equal(event.status, 'DELIVERED'); assert.equal(event.attempts, 1);
    assert.deepEqual(await db.waDispatch.findUniqueOrThrow({ where: { id } }), job);
    console.log(JSON.stringify({ status, http_status: response.status, event_id: result.event_id, webhook_delivery: event.status }));
  }
  console.log('MANUAL_WEBHOOK_END_TO_END_TWO_STATUSES_PASSED_NO_WHATSAPP_NO_CUSTOMER_JOB_ID');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  if (created) await db.waDispatch.deleteMany({ where: { id, storeId: 'webhook-manual-test', status: 'FAILED', lastError: 'SYNTHETIC_TEST' } });
  await db.$disconnect();
});
