const path = require('node:path');
const { randomUUID } = require('node:crypto');
const app = '/home/jeblast/repos/doran-whatsapp-server';
require(path.join(app, 'node_modules/@next/env')).loadEnvConfig(app);
const { PrismaClient } = require(path.join(app, 'node_modules/@prisma/client'));
const db = new PrismaClient();
(async () => {
  const settings = await db.dispatchWebhookSetting.findUnique({ where: { id: 1 }, select: { enabled: true, url: true } });
  console.log(JSON.stringify({ dispatch_webhook_settings: settings }));
  const eventId = randomUUID();
  const response = await fetch('https://kasir.doran.id/api/webhooks/jeblast/dispatch-status', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Jeblast-Event-Id': eventId },
    body: JSON.stringify({ event_id: eventId, sequence: 1, event: 'dispatch.webhook.test', occurred_at: new Date().toISOString(), previous_status: null, dispatch: null }),
  });
  let data = {}; try { data = await response.json(); } catch {}
  console.log(JSON.stringify({ http_status: response.status, result: data.result, message: data.message }));
})().catch(error => { console.error(error.code || error.name); process.exitCode = 1; }).finally(() => db.$disconnect());
