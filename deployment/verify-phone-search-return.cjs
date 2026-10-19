const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync('src/lib/phoneSearchState.ts', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const exportsObject = {};
const policySort = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/phonePolicySort.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: policySort });
vm.runInNewContext(compiled.outputText, { exports: exportsObject, URLSearchParams, require: key => { assert.equal(key, './phonePolicySort'); return policySort; } });
const { readPhoneSearchState, phoneSearchQuery } = exportsObject;
const plain = value => JSON.parse(JSON.stringify(value));

const original = {
  name: 'DG Bali & JETE', number: '6281', is_online: '0', active: '1',
  page: '3', limit: '10', sort: 'name', order: 'asc', search: 'hidden',
};
const state = readPhoneSearchState(original);
const carried = new URLSearchParams(phoneSearchQuery(state)).toString();
const restored = readPhoneSearchState(Object.fromEntries(new URLSearchParams(carried)));
assert.deepEqual(plain(restored), plain(state));
assert.equal(restored.filters.is_online, '0', 'Offline filter must survive the return trip');
assert.equal(restored.table.page, 3);
assert.equal(restored.showSearch, false);
for (const sort of ['health', 'quota', 'sendInterval']) {
  for (const order of ['asc', 'desc']) {
    const sorted = readPhoneSearchState({ ...original, sort, order });
    assert.equal(sorted.table.sort, sort);
    assert.equal(sorted.table.order, order);
    assert.deepEqual(plain(readPhoneSearchState(phoneSearchQuery(sorted))), plain(sorted));
  }
}

const invalid = readPhoneSearchState({ page: '-2', limit: '999999', sort: 'password', order: 'asc', is_online: 'false', active: ['0', '1'], returnTo: 'https://example.com' });
assert.deepEqual(plain(invalid.table), { page: 1, limit: 5, sort: '', order: '' });
assert.equal(invalid.filters.is_online, '');
assert.equal(invalid.filters.active, '');
assert.deepEqual(plain(phoneSearchQuery(invalid)), {});

const all = readPhoneSearchState({ name: '', number: '', is_online: '', active: '' });
assert.deepEqual(plain(phoneSearchQuery(all)), {});
assert.equal(all.showSearch, true);
console.log('PHONE_SEARCH_RETURN_ROUND_TRIP_AND_INPUT_VALIDATION_OK');
