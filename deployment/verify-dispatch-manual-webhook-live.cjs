const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
(async () => {
  const owner = await db.user.findFirstOrThrow({ where: { role: 'ADMIN', email: 'admin@gmail.com' } });
  const base = 'https://dashboard.jeblast.com';
  const headers = { Authorization: 'Bearer ' + owner.token, 'Content-Type': 'application/json' };
  const post = async body => fetch(base + '/api/dispatch-webhook', { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(25000) });
  assert.equal((await fetch(base + '/api/dispatch-webhook')).status, 401);
  assert.equal((await fetch(base + '/api/dispatch-webhook', { headers })).status, 405);
  assert.equal((await post({ id: randomUUID(), status: 'INVALID' })).status, 400);
  assert.equal((await post({ id: randomUUID(), status: 'READ' })).status, 404);
  const { encode } = require('next-auth/jwt');
  const jwt = await encode({ token: { id: owner.id, token: owner.token, name: owner.name, email: owner.email }, secret: process.env.NEXTAUTH_SECRET });
  const page = await fetch(base + '/dashboard/dispatch', { headers: { Cookie: '__Secure-next-auth.session-token=' + jwt } });
  assert.equal(page.status, 200);
  const html = await page.text();
  const chunks = [...html.matchAll(/<script[^>]*src="([^"]+\.js)"/g)].map(match => match[1]);
  const js = (await Promise.all(chunks.map(async chunk => {
    const response = await fetch(new URL(chunk, base)); assert.equal(response.status, 200); return response.text();
  }))).join('\n');
  assert(js.includes('Kirim webhook')); assert(js.includes('Status webhook')); assert(js.includes('/api/dispatch-webhook'));
  assert(js.includes('https://kasir.doran.id/api/webhooks/jeblast/dispatch-status'));
  assert(js.includes('Detail webhook')); assert(js.includes('Salin lengkap'));
  const job = await db.waDispatch.findFirst();
  if (job) {
    const response = await post({ id: job.id, status: 'READ', action: 'preview' });
    assert.equal(response.status, 200);
    const { details } = await response.json();
    assert.equal(details.mode, 'preview'); assert.equal(details.request.body.dispatch.id, job.id);
    assert.equal(details.request.body.dispatch.status, 'READ'); assert.equal(details.response, null);
    const config = await db.dispatchWebhookSetting.findUnique({ where: { id: 1 } });
    const device = await db.deviceWebhookSetting.findUnique({ where: { id: 1 } });
    const secret = (config?.url === details.request.url ? config.secret : '') || (device?.url === 'https://kasir.doran.id/api/webhooks/jeblast/wa-phone' ? device.secret : '');
    assert(details.request.headers.Authorization === (secret ? 'Bearer ' + secret : '[kunci belum tersedia]'), 'Authorization must match the existing cashier key');
    assert.deepEqual(await db.waDispatch.findUnique({ where: { id: job.id } }), job);
    // Concurrent automatic traffic may add events; a preview must not create an event for its placeholder.
    assert.equal(await db.dispatchWebhookEvent.count({ where: { eventId: '[dibuat saat dikirim]' } }), 0);
  }
  console.log('MANUAL_WEBHOOK_LIVE_PAGE_BUNDLE_AUTH_METHOD_VALIDATION_NOT_FOUND_PASSED');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
