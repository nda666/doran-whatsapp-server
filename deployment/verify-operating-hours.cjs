'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const mod = { exports: {} };
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/operatingHours.ts'), 'utf8'), {
  compilerOptions: { module: 1, target: 7, esModuleInterop: true },
}).outputText;
new Function('require', 'module', 'exports', code)(require, mod, mod.exports);
const { parseOperatingHours, operatingHoursState, effectiveOperatingHours, DEFAULT_OPERATING_HOURS } = mod.exports;
const daily = { enabled: true, start: '08:00', end: '20:00' };
const overnight = { enabled: true, start: '22:00', end: '06:00' };
function check(hours, at, open, next) {
  const state = operatingHoursState(hours, new Date(at));
  assert.equal(state.open, open, at);
  assert.equal(state.nextOpenAt?.toISOString() || null, next || null, at);
}
check(daily, '2026-10-20T00:59:59.999Z', false, '2026-10-20T01:00:00.000Z');
check(daily, '2026-10-20T01:00:00.000Z', true);
check(daily, '2026-10-20T12:59:59.999Z', true);
check(daily, '2026-10-20T13:00:00.000Z', false, '2026-10-21T01:00:00.000Z');
check(daily, '2026-10-20T18:00:00.000Z', false, '2026-10-21T01:00:00.000Z');
check(overnight, '2026-10-20T14:59:59.999Z', false, '2026-10-20T15:00:00.000Z');
check(overnight, '2026-10-20T15:00:00.000Z', true);
check(overnight, '2026-10-20T16:59:59.999Z', true);
check(overnight, '2026-10-20T17:00:00.000Z', true);
check(overnight, '2026-10-20T22:59:59.999Z', true);
check(overnight, '2026-10-20T23:00:00.000Z', false, '2026-10-21T15:00:00.000Z');
check({ enabled: true, start: '22:00', end: '00:00' }, '2026-10-20T17:00:00.000Z', false, '2026-10-21T15:00:00.000Z');
check(DEFAULT_OPERATING_HOURS, '2026-10-20T23:00:00.000Z', true);
for (const bad of [null, {}, { ...daily, start: '24:00' }, { ...daily, end: '7:30' }, { ...daily, start: daily.end }, { ...daily, enabled: 'true' }, { ...daily, timezone: 'UTC' }]) assert.equal(parseOperatingHours(bad), null);
assert.deepEqual(parseOperatingHours(JSON.stringify(daily)), daily);
assert.equal(effectiveOperatingHours(daily, null), daily);
assert.deepEqual(effectiveOperatingHours(daily, DEFAULT_OPERATING_HOURS), DEFAULT_OPERATING_HOURS, 'Custom 24-hour mode overrides global restrictions');
assert.throws(() => effectiveOperatingHours(daily, { enabled: true }));
console.log('OPERATING_HOURS_TESTS_PASSED: WIB boundaries, overnight, midnight, next opening, 24-hour mode, validation, global inheritance and custom override');
