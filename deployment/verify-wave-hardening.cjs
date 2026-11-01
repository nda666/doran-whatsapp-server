'use strict';
// Offline checks for the SSRF-safe webhook helper, inbound dedupe, API rate window, spintax, typing delay,
// recipient policy decisions and the new traffic defaults. No database or network is used.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const ts = require('typescript');
function load(relative, stubs = {}) {
  const filename = path.resolve(__dirname, '..', relative), module = { exports: {} }, real = createRequire(filename);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', source)(name => Object.hasOwn(stubs, name) ? stubs[name] : real(name), module, module.exports);
  return module.exports;
}
(async () => {
  const link = load('src/server/utils/safeLinkPreview.ts', {});
  const http = load('src/server/utils/safeHttpRequest.ts', { './safeLinkPreview': link });
  for (const url of ['http://127.0.0.1/x', 'http://10.0.0.5/x', 'http://169.254.169.254/latest', 'http://[::1]/x', 'http://localhost/x'])
    await assert.rejects(http.safeHttpRequest(url), /PRIVATE_WEBHOOK_ADDRESS|ENOTFOUND|EAI_AGAIN/, url);
  await assert.rejects(http.safeHttpRequest('http://example.com:8080/x'), /INVALID_WEBHOOK_URL/);
  await assert.rejects(http.safeHttpRequest('ftp://example.com/x'), /INVALID_WEBHOOK_URL/);
  const fetchHelper = load('src/server/utils/runFetchGetResponse.ts', { './safeHttpRequest': http });
  assert.match((await fetchHelper.runFetchGetResponse({ url: 'http://127.0.0.1/hook', method: 'GET' })).error, /PRIVATE_WEBHOOK_ADDRESS/);
  assert.deepEqual(fetchHelper.buildResponse({ status: 200, body: '{"a":1}' }), { result: { a: 1 }, error: undefined });
  assert.equal(fetchHelper.buildResponse({ status: 200, body: 'nope' }).error, 'INVALID_WEBHOOK_JSON');
  assert.match(fetchHelper.buildResponse({ status: 500, body: '' }).error, /500/);

  const dedupe = load('src/server/messaging/incomingDedupe.ts');
  assert.equal(dedupe.alreadyProcessed('p', 'm1', 1000), false);
  assert.equal(dedupe.alreadyProcessed('p', 'm1', 2000), true);
  assert.equal(dedupe.alreadyProcessed('q', 'm1', 2000), false);
  assert.equal(dedupe.alreadyProcessed('p', 'm1', 1000 + 3_600_001), false);
  assert.equal(dedupe.alreadyProcessed('p', undefined), false);

  process.env.DISPATCH_API_RATE_LIMIT_PER_MINUTE = '3';
  const auth = load('src/server/dispatchAuth.ts', { '@/lib/prisma': { prisma: {} }, '@/lib/access': { isApproved: () => true } });
  assert.deepEqual([1, 2, 3, 4].map(() => auth.apiRateAllowed('t', 1000, 3)), [true, true, true, false]);
  assert.equal(auth.apiRateAllowed('t', 1000 + 60_001, 3), true);

  const { spin } = load('src/lib/spintax.ts');
  assert.equal(spin('Halo {nama}, pesanan {no}', 's'), 'Halo {nama}, pesanan {no}');
  const text = '{Halo|Hai|Selamat siang} Pak, {terima kasih|makasih}';
  assert.equal(spin(text, 'job-1'), spin(text, 'job-1'));
  const seen = new Set(Array.from({ length: 60 }, (_, i) => spin(text, 'job-' + i)));
  assert(seen.size > 1 && [...seen].every(value => !value.includes('{') && !value.includes('|')));

  const { typingDelayMs } = load('src/server/dispatch/timing.ts', { '../../lib/dispatchSettings': { DEFAULT_DISPATCH_DELAY: { minSeconds: 8, maxSeconds: 20 } } });
  assert(typingDelayMs(0, () => 0) >= 600 && typingDelayMs(10_000, () => 0.999) <= 4600 && typingDelayMs(40, () => 0) > typingDelayMs(5, () => 0));

  const policy = load('src/server/messaging/recipientPolicy.ts', { '../../lib/prisma': { prisma: {} }, '../../lib/access': { isApproved: u => u.approvalStatus === 'APPROVED' && u.isActive !== false } });
  assert.equal(policy.looksInvalid(3, 2, 0), true);
  assert.equal(policy.looksInvalid(3, 1, 0), false);
  assert.equal(policy.looksInvalid(2, 2, 0), false);
  assert.equal(policy.looksInvalid(5, 3, 1), false);

  const hoursLib = load('src/server/messaging/sendHours.ts');
  assert.equal(hoursLib.wibHour(new Date('2026-11-01T17:30:00Z')), 0); // 00:30 WIB next day
  assert.deepEqual(hoursLib.addSendHour(null, 9), { 9: 1 });
  assert.deepEqual(hoursLib.addSendHour({ 9: 2 }, 9), { 9: 3 });
  assert.deepEqual(hoursLib.addSendHour([1, 2], 3), { 3: 1 });
  const night = hoursLib.engagementSummary(100, 4, { 9: 30, 23: 20 });
  assert.equal(night.replyRate, 0.04); assert.equal(night.quietHourShare, 0.4);
  assert.equal(hoursLib.engagementSummary(10, 5, {}).replyRate, null);
  assert.equal(hoursLib.engagementSummary(100, 0, { 9: 5 }).quietHourShare, null);

  const traffic = load('src/lib/trafficSettings.ts');
  assert.equal(traffic.DEFAULT_TRAFFIC_POLICY.enabled, true);
  assert(traffic.validTrafficPolicy(traffic.DEFAULT_TRAFFIC_POLICY));
  assert.equal(traffic.parseTrafficPolicy('{"enabled":false}').recipientPerDay, 10);
  assert.equal(traffic.parseTrafficPolicy('{"recipientPerDay":0}'), null);
  assert.equal(traffic.parseTrafficPolicy('{"requireConsent":"yes"}'), null);
  console.log('WAVE_HARDENING_OK');
})().catch(error => { console.error(error); process.exit(1); });
