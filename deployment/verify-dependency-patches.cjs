'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const vm = require('node:vm');
const redirects = require('follow-redirects');
const qs = require('qs');
const listen = server => new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
(async () => {
  assert.equal(qs.stringify({ a: [1, 2] }, { arrayFormat: 'comma' }), 'a=1%2C2');
  assert.doesNotThrow(() => qs.stringify({ a: [{ toString: 'not-callable' }] }, { arrayFormat: 'comma' }));
  assert.doesNotThrow(() => qs.stringify({ a: [Object.create(null)] }, { arrayFormat: 'comma', encodeValuesOnly: true }));
  let received;
  const target = http.createServer((req, res) => { received = req.headers; res.end('ok'); });
  const origin = http.createServer((_req, res) => { res.writeHead(302, { Location: `http://127.0.0.1:${target.address().port}/target` }); res.end(); });
  try {
    await listen(target); await listen(origin);
    await new Promise((resolve, reject) => {
      const req = redirects.http.get(`http://127.0.0.1:${origin.address().port}/`, {
        headers: { 'X-Fixture-Secret': 'not-a-real-credential', 'X-Harmless': 'retained' },
        sensitiveHeaders: vm.runInNewContext("['X-Fixture-Secret']"),
      }, response => { response.resume(); response.on('end', resolve); response.on('error', reject); });
      req.on('error', reject); req.setTimeout(5000, () => req.destroy(Error('LOCAL_TEST_TIMEOUT')));
    });
    assert.equal(received['x-fixture-secret'], undefined, 'Cross-realm custom sensitive headers must not cross origins');
    assert.equal(received['x-harmless'], 'retained');
  } finally { await Promise.all([close(origin), close(target)]); }
  console.log('DEPENDENCY_PATCH_REGRESSIONS_OK');
})().catch(error => { console.error(error); process.exitCode = 1; });
