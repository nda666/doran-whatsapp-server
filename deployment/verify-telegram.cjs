'use strict';
// Offline only: native HTTPS is replaced before importing the service.
require('./ci-register.cjs');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const https = require('node:https');
const originalRequest = https.request;
let nativeScenario = 'success', captured;
https.request = (url, options, receive) => {
  captured = { url, options };
  const req = new EventEmitter();
  req.destroy = error => { req.emit('error', error); };
  req.end = payload => {
    captured.payload = JSON.parse(payload);
    const socket = new EventEmitter();
    req.emit('socket', socket);
    if (nativeScenario === 'connection_timeout') return;
    socket.emit('secureConnect');
    if (nativeScenario === 'request_timeout') return;
    if (nativeScenario === 'network') return req.destroy(new Error('secret must not escape'));
    const res = new EventEmitter();
    res.statusCode = 200;
    res.headers = {};
    receive(res);
    if (nativeScenario === 'aborted') return res.emit('aborted');
    res.emit('data', Buffer.from('{"confirmed":true}'));
    res.emit('end');
  };
  return req;
};
const { createTelegramService, telegramHttp, normalizeTelegramPhone, telegramConfig } = require('../src/server/telegram/service.ts');
const { telegramDispatchOutcome } = require('../src/server/telegram/dispatch.ts');
const config = { baseUrl: 'https://tele.jeblast.com', apiKey: 'offline-only-secret', testMode: false, successField: 'confirmed', successValue: true };
const input = { phone: '081234567890', message: 'Permintaan unlock harga untuk nota #123 "quoted"\nline' };
let checks = 0;
const check = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
async function main() {
  const logs = [];
  const service = createTelegramService(config, telegramHttp, result => logs.push(result));
  check(normalizeTelegramPhone('08 123-456-7890'), '+6281234567890');
  check(normalizeTelegramPhone('+6281234567890'), '+6281234567890');
  assert.throws(() => normalizeTelegramPhone('08; malicious')); checks++;
  check((await service.send(input)).status, 'sent');
  check(captured.options.headers['X-API-KEY'], config.apiKey);
  check(captured.url.href, 'https://tele.jeblast.com/api/send');
  check(captured.options.method, 'POST');
  check(captured.payload, { phone: '+6281234567890', peer_type: 'user', message: input.message });
  await service.send({ ...input, mediaUrl: 'https://example.com/a.jpg', caption: 'Bukti' });
  check(captured.payload.media_url, 'https://example.com/a.jpg');
  check(captured.payload.caption, 'Bukti');
  await createTelegramService({ ...config, testMode: true, testPhone: '089999999999' }, telegramHttp, () => {}).send(input);
  check(captured.payload.phone, '+6289999999999');
  check((await createTelegramService({ ...config, testMode: true }, telegramHttp, () => {}).send(input)).status, 'failed');
  check((await service.send({ ...input, mediaUrl: 'file:///secret' })).status, 'failed');
  check((await service.send({ ...input, caption: 'orphan' })).status, 'failed');
  const response = (status, body, headers = {}, override = {}) => createTelegramService({ ...config, ...override }, async () => ({ status, body: typeof body === 'string' ? body : JSON.stringify(body), headers }), r => logs.push(r)).send(input);
  check((await response(200, { confirmed: true, success: false })).reason, 'provider_rejected');
  check((await response(200, { confirmed: true, error: 'rejected' })).status, 'failed');
  check((await response(200, { confirmed: false })).status, 'unknown');
  check((await response(200, { confirmed: true }, {}, { successField: undefined })).status, 'unknown');
  check((await response(200, '<html>not JSON</html>')).status, 'unknown');
  check((await response(204, '')).status, 'unknown');
  check((await response(500, {})).reason, 'http_error');
  check((await response(302, {})).status, 'failed');
  check((await response(401, { message: 'flood', retry_after: 10 })).reason, 'invalid_credentials');
  check((await response(200, { error: 'Invalid API key flood', retry_after: 10 })).reason, 'invalid_credentials');
  check((await response(404, { message: 'flood' })).reason, 'recipient_not_found');
  check((await response(200, { error: 'USER_NOT_FOUND flood', retry_after: 10 })).reason, 'recipient_not_found');
  check((await response(420, {}, { 'retry-after': '12' })).retryAfterMs, 12000);
  check((await response(400, 'FLOOD_WAIT', { 'retry-after': '6' })).retryAfterMs, 6000);
  check((await response(200, { error: { message: 'flood', code: 420 }, retry_after: 3 })).retryAfterMs, 3000);
  check((await response(200, { error: { message: 'flood', code: 401 }, retry_after: 3 })).reason, 'invalid_credentials');
  check((await response(200, { error: 'API key is invalid flood', retry_after: 3 })).reason, 'invalid_credentials');
  check((await response(200, { error: 'flood', parameters: { retry_after: 4 } })).retryAfterMs, 4000);
  check((await response(420, {})).retryAfterMs, undefined);
  check((await response(420, { retry_after: -1 })).retryAfterMs, undefined);
  const dateResult = await response(420, {}, { 'retry-after': new Date(Date.now() + 90000).toUTCString() });
  assert.ok(dateResult.retryAfterMs >= 88000); checks++;
  check((await response(200, { data: { accepted: 'yes' } }, {}, { successField: 'data.accepted', successValue: 'yes' })).status, 'sent');

  // Deterministic native connection and total timeout tests, no waiting or sockets.
  const realSet = global.setTimeout, realClear = global.clearTimeout;
  for (const [scenario, duration] of [['connection_timeout', 10000], ['request_timeout', 60000]]) {
    const timers = [];
    global.setTimeout = (callback, ms) => { const timer = { callback, ms, cleared: false }; timers.push(timer); return timer; };
    global.clearTimeout = timer => { if (timer) timer.cleared = true; };
    try {
      nativeScenario = scenario;
      const pending = service.send(input);
      const timer = timers.find(t => t.ms === duration && !t.cleared);
      assert.ok(timer); checks++;
      timer.callback();
      const result = await pending;
      check(result.status, 'unknown');
      check(result.reason, scenario);
      assert.ok(timers.every(t => t.cleared)); checks++;
    } finally { global.setTimeout = realSet; global.clearTimeout = realClear; }
  }
  for (const scenario of ['network', 'aborted']) {
    nativeScenario = scenario;
    check((await service.send(input)).status, 'unknown');
  }

  const limited = { status: 'rate_limited', reason: 'provider_flood', requestId: 'test-job', retryAfterMs: 12000 };
  check(telegramDispatchOutcome(limited, 1, 1000).nextAttemptAt.getTime(), 13000);
  check(telegramDispatchOutcome(limited, 2).status, 'QUEUED');
  check(telegramDispatchOutcome(limited, 3).status, 'FAILED');
  check(telegramDispatchOutcome(limited, 3).lastError, 'TELEGRAM_FLOOD_EXHAUSTED');
  for (const result of [
    { status: 'unknown', reason: 'request_timeout' },
    { status: 'failed', reason: 'invalid_credentials' },
    { status: 'failed', reason: 'recipient_not_found' },
    { status: 'rate_limited', reason: 'provider_flood' },
  ]) {
    check(telegramDispatchOutcome(result, 1).status, result.status === 'unknown' ? 'UNCERTAIN' : 'FAILED');
  }
  check(telegramDispatchOutcome({ status: 'sent', reason: 'confirmed_success' }, 1).status, 'SENT');
  assert.ok(!JSON.stringify(logs).includes(config.apiKey)); checks++;
  assert.ok(!JSON.stringify(logs).includes(input.message)); checks++;
  assert.ok(!JSON.stringify(logs).includes('secret must not escape')); checks++;
  process.env.TELEGRAM_TEST_MODE = 'typo';
  assert.throws(telegramConfig, /TELEGRAM_TEST_MODE/); checks++;
  delete process.env.TELEGRAM_TEST_MODE;
  console.log(`TELEGRAM_OFFLINE_PASSED (${checks} checks; no real messages)`);
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { https.request = originalRequest; });
