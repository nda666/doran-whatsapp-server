'use strict';
// Load the real compiled guard from Next.js and dist. No DB, socket, or server startup.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const nextDirectory = path.join(root, process.env.DORAN_LOCAL === 'true' ? '.next-local' : '.next', 'server');
const runtime = require(path.join(nextDirectory, 'webpack-runtime.js'));
const marker = 'doran.send-guard-error.v1';
for (const file of fs.readdirSync(path.join(nextDirectory, 'chunks'))) {
  const filename = path.join(nextDirectory, 'chunks', file);
  if (file.endsWith('.js') && fs.readFileSync(filename, 'utf8').includes(marker)) runtime.C(require(filename));
}
const candidates = Object.entries(runtime.m).filter(([, factory]) => factory.toString().includes(marker));
assert(candidates.length > 0, 'Next.js build must contain the branded send guard');
const server = require(path.join(root, 'dist/src/server/messaging/sendGuardError.js'));
for (const [id] of candidates) {
  const exports = Object.values(runtime(id));
  const Guard = exports.find(value => typeof value === 'function' && value.prototype instanceof Error);
  assert(Guard, 'Next.js guard constructor exported');
  const retryAt = new Date(Date.now() + 60000);
  const bundledError = new Guard('DEVICE_DAILY_LIMIT', retryAt);
  const predicate = exports.find(value => typeof value === 'function' && value !== Guard && value(bundledError) === true);
  assert(predicate, 'Next.js guard predicate exported');
  assert.notEqual(Guard, server.SendGuardError, 'exercise separate constructors, as used by production');
  assert.equal(bundledError instanceof server.SendGuardError, false, 'reproduce the old instanceof failure');
  assert(server.isSendGuardError(bundledError), 'worker recognizes Next.js pre-transport guard');
  assert(predicate(new server.SendGuardError('DEVICE_THROTTLED', retryAt)), 'Next.js recognizes server pre-transport guard');
  assert.equal(bundledError.retryAt, retryAt);
  for (const error of [Object.assign(new Error('provider failure'), { code: 'DEVICE_DAILY_LIMIT' }),
    new Guard('UNKNOWN_PROVIDER_ERROR'), new Guard('DEVICE_THROTTLED', new Date(NaN))]) {
    assert.equal(server.isSendGuardError(error), false, 'ambiguous/provider errors must not become automatic retries');
    assert.equal(predicate(error), false);
  }
}
console.log('SEND_GUARD_BUILD_PASSED: actual Next.js/dist guards interoperate; unknown errors remain ambiguous');
