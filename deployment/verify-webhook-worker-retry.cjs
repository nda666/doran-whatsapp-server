const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const logs = [];
let now = 1000;
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/server/utils/webhookWorkerRetry.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: exportsObject, Date: { now: () => now }, console: { error: (...args) => logs.push(args) } });
const retry = exportsObject.webhookWorkerRetry('TEST_WORKER_FAILED');
assert.equal(retry.ready(), true);
for (const delay of [2000, 4000, 8000, 16000, 32000, 60000, 60000]) {
  retry.fail({ code: 'P1001', message: 'mysql://secret', meta: { secret: 'private' } });
  assert.equal(logs.at(-1)[1].retryMs, delay);
  assert.equal(retry.ready(), false);
  now += delay - 1;
  assert.equal(retry.ready(), false);
  now++;
  assert.equal(retry.ready(), true);
}
assert.equal(JSON.stringify(logs).includes('secret'), false);
retry.reset();
retry.fail({ code: 'mysql://secret' });
assert.equal(logs.at(-1)[1].retryMs, 2000);
assert.equal(logs.at(-1)[1].code, 'UNKNOWN');
console.log('WEBHOOK_WORKER_RETRY_OK: backoff, cap, recovery reset, secret-safe logging');
