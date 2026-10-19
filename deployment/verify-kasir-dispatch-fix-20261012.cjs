// Explicit endpoint test. Does not enable webhook configuration or send WhatsApp.
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const app = '/home/jeblast/repos/doran-whatsapp-server';
process.chdir(app);
require(path.join(app, 'node_modules/@next/env')).loadEnvConfig(app);
const { PrismaClient } = require(path.join(app, 'node_modules/@prisma/client'));
const db = new PrismaClient();
const endpoint = 'https://kasir.doran.id/api/webhooks/jeblast/dispatch-status';
(async () => {
  const config = await db.dispatchWebhookSetting.findUniqueOrThrow({ where: { id: 1 } });
  const device = await db.deviceWebhookSetting.findUnique({ where: { id: 1 } });
  const secret = config.secret || (device?.url === 'https://kasir.doran.id/api/webhooks/jeblast/wa-phone' ? device.secret : '');
  assert(secret, 'No existing cashier webhook authentication key available');
  console.log(JSON.stringify({ configured_url: config.url, enabled: config.enabled,
    status_key_configured: !!config.secret, authentication_source: config.secret ? 'dispatch_webhook' : 'existing_cashier_device_webhook' }));
  const post = async (payload, label) => {
    const response = await fetch(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json', Accept: 'application/json', 'X-Jeblast-Event-Id': payload.event_id },
      body: JSON.stringify(payload) });
    let data = {}; try { data = await response.json(); } catch {}
    const result = { label, http_status: response.status, event_id: payload.event_id, dispatch_id: payload.dispatch?.id || null,
      result: data.result, message: typeof data.message === 'string' ? data.message.replaceAll(secret, '[redacted]').slice(0, 300) : undefined,
      validation_fields: Object.keys(data.errors || {}), duplicate: data.data?.duplicate,
      updated: data.data?.updated, messages_updated: data.data?.messages_updated };
    console.log(JSON.stringify(result)); return result;
  };
  const now = new Date().toISOString();
  const test = await post({ event_id: randomUUID(), sequence: 1, event: 'dispatch.webhook.test', occurred_at: now, previous_status: null, dispatch: null }, 'dashboard_test_event');
  assert.equal(test.http_status, 200);
  assert.equal(test.result, true);
  assert.equal(test.messages_updated, 0);
  const unauthorized = await fetch(endpoint, { method: 'POST', redirect: 'error', headers: {'Content-Type':'application/json',Accept:'application/json'}, body: '{}', signal: AbortSignal.timeout(15000) });
  assert.equal(unauthorized.status, 401);
  console.log('UNAUTHORIZED_WEBHOOK_REJECTED_401');
  const payload = { event_id: randomUUID(), sequence: 1, event: 'dispatch.status_changed', occurred_at: now, previous_status: 'SENT',
    dispatch: { id: randomUUID(), job_id: null, device_id: randomUUID(), user_id: randomUUID(),
      transaction_id: 'webhook-test-' + randomUUID(), store_id: 'webhook-test', message_key: 'endpoint-test', campaign_id: null,
      source: 'API', recipient: '6280000000000', status: 'DELIVERED', message_id: 'synthetic-' + randomUUID(), attempts: 1, error: null,
      created_at: now, updated_at: now, sent_at: now, delivered_at: now, read_at: null } };
  const received = await post(payload, 'synthetic_status_event');
  assert.equal(received.http_status, 200);
  if (received.http_status >= 200 && received.http_status < 300) {
    assert.equal(received.messages_updated, 0, 'Synthetic event must not update a cashier message');
    const repeated = await post(payload, 'duplicate_status_event');
    assert.equal(repeated.duplicate, true);
    const { sendDeviceWebhook } = require(path.join(app, 'dist/src/server/utils/sendDeviceWebhook'));
    await sendDeviceWebhook(endpoint, payload, { Authorization: 'Bearer ' + secret, 'X-Jeblast-Event-Id': payload.event_id });
    console.log('PRODUCTION_WEBHOOK_TRANSPORT_ACCEPTED_SAME_EVENT');
  }
  const after = await db.dispatchWebhookSetting.findUniqueOrThrow({ where: { id: 1 } });
  assert.deepEqual(after, config);
  console.log('CONFIGURATION_UNCHANGED_NO_WHATSAPP_SEND');
})().catch(error => { console.error(error.code || error.name || 'TEST_FAILED'); process.exitCode = 1; }).finally(() => db.$disconnect());
