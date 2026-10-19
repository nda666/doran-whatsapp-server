const assert = require('node:assert/strict');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const base = 'https://dashboard.jeblast.com';
async function request(path, method, input = {}, headers = {}) {
  const url = base + path + (method === 'GET' ? '?' + new URLSearchParams(input) : '');
  const response = await fetch(url, { method, headers: { ...headers, ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}) },
    ...(method === 'POST' ? { body: JSON.stringify(input) } : {}), signal: AbortSignal.timeout(20000) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}
(async () => {
  // No valid credentials for send/disconnect/QR actions: no side effects possible.
  const actions = ['send-message','v2/send-message','send-status','send-media','send-poll','send-sticker','send-button','send-list','send-location','send-vcard','session','disconnect','check-number','generate-qr','list-phones','phone-detail','send-group-message','send-attachment'];
  for (const action of actions) {
    const method = action === 'send-attachment' ? 'GET' : 'POST';
    const a = await request('/api/' + action, method);
    const b = await request('/api/public/' + action, method);
    assert.notEqual(a.status, 404, action); assert.deepEqual(b, a, action);
    assert.equal(a.body?.result, false, action + ' expected safe failure');
    assert(Object.hasOwn(a.body, 'curl_error'), action + ' missing curl_error');
    assert.equal(a.body.curl_error, null, action + ' curl_error');
    console.log('LIVE_URL_PARITY_OK', action, a.status);
  }
  const phone = await db.phone.findFirst();
  assert(phone?.token, 'Device token required for read-only verification');
  for (const prefix of ['/api/', '/api/public/']) {
    const bearer = await request(prefix + 'session', 'GET', {}, { Authorization: 'Bearer ' + phone.token });
    const body = await request(prefix + 'session', 'POST', { api_key: phone.token });
    const query = await request(prefix + 'session', 'GET', { api_key: phone.token });
    assert.equal(bearer.status, 200); assert.deepEqual(body, bearer); assert.deepEqual(query, bearer);
    const input = { number: '6281217357535', message: 'Validation only; no send', transaction_id: 'PARITY-DRY-RUN', dry_run: true };
    const a = await request(prefix + 'send-message', 'POST', input, { Authorization: 'Bearer ' + phone.token });
    const b = await request(prefix + 'send-message', 'POST', { ...input, api_key: phone.token });
    assert.equal(a.status, 200); assert.equal(a.body.dry_run, true); assert.deepEqual(a, b);
    const status = await request(prefix + 'send-status', 'GET', { api_key: phone.token, id: 'nonexistent-parity-verification' });
    assert.equal(status.status, 200); assert.equal(status.body.total, 0);
    console.log('LIVE_TOKEN_AUTH_AND_DRY_RUN_OK', prefix);
  }
  console.log('DEVICE_API_PARITY_LIVE_OK_NO_MESSAGES_SENT');
  console.log('DEVICE_API_CURL_ERROR_METADATA_LIVE_OK');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
