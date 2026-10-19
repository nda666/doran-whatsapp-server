'use strict';
// Synthetic fixtures only; never connects to the API, database, or WhatsApp.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const antd = require('antd');
function load(name, mocks) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(name, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', code)(key => key in mocks ? mocks[key] : require(key), module, module.exports);
  return module.exports;
}
const base = {
  id: 'device-a', name: 'Synthetic A', dailyLimit: 200, useGlobalQuota: true,
  globalQuota: 350, used: 12, effectiveLimit: 350, minIntervalSeconds: null,
  globalInterval: { minSeconds: 7, maxSeconds: 15 }, adaptiveEnabled: true,
  paused: false, warmupStartedAt: null,
  health: { score: null, reason: 'Data belum cukup (minimal 20 percobaan hari ini)', stop: false, multiplier: 1 },
};
let editing, calls = [], reloads = 0, stateIndex = 0, failure = false, release;
const mockedReact = { ...React,
  useMemo: fn => fn(), useRef: value => ({ current: value }),
  useState: () => [stateIndex++ === 0 ? editing : false, () => {}],
};
const policyTools = load('src/components/phone/PhonePolicyControls.tsx', {
  react: mockedReact,
  antd: { ...antd, message: { success() {}, error() {} } },
  axios: { __esModule: true, default: { put: async (...args) => {
    calls.push(args);
    if (release) await new Promise(resolve => { release.resolve = resolve; });
    if (failure) throw new Error('Synthetic failure');
  } } },
  '@/lib/useDashboardApi': { useDashboardApi: () => ({ data: [base], error: '', reload: () => { reloads++; }, headers: { Authorization: 'Bearer synthetic' } }) },
});
function cell(key, policy = base, id = base.id) {
  const columns = policyTools.phonePolicyColumns(target => target === policy.id ? policy : undefined);
  return renderToStaticMarkup(columns.find(column => column.key === key).render(undefined, { id }, 0));
}
assert.equal((cell('health').match(/Data belum cukup/g) || []).length, 1);
assert.match(cell('health'), /Minimal 20 percobaan hari ini/);
assert.match(cell('health'), /Siap mengirim/);
assert.match(cell('health', { ...base, paused: true, pauseReason: 'Pembatasan sementara' }), /Pembatasan sementara/);
assert.match(cell('health', { ...base, health: { score: 0, reason: 'Banyak kegagalan', stop: true, multiplier: 3 } }), /Dihentikan otomatis/);
assert.match(cell('health', { ...base, adaptiveEnabled: false, health: { score: 80, reason: 'Normal', stop: true, multiplier: 3 } }), /Siap mengirim/);
assert.match(cell('quota'), /12.*350/);
assert.match(cell('quota'), /Global: 350/);
assert.match(cell('quota', { ...base, useGlobalQuota: false, dailyLimit: 100, effectiveLimit: 25 }), /Custom: 100/);
assert.match(cell('sendInterval'), /Ikuti pengaturan global/);
assert.match(cell('sendInterval', { ...base, minIntervalSeconds: 30 }), /Minimum khusus: 30 detik/);
assert.match(cell('warmup'), /Tidak aktif/);
assert.match(cell('warmup', { ...base, warmupStartedAt: '2026-10-15T00:00:00.000Z' }), /Sejak 15\/10\/2026/);
for (const key of ['health', 'quota', 'sendInterval', 'warmup']) assert.match(cell(key, base, 'other-device'), /Belum tersedia/);
function formFor(policy) {
  editing = policy; stateIndex = 0;
  return policyTools.default().modal.props.children;
}
const values = { useGlobalQuota: false, dailyLimit: 80, followGlobal: false, minIntervalSeconds: 25, adaptiveEnabled: true, paused: true, warmupEnabled: true };
(async () => {
  await formFor(base).props.onFinish(values);
  assert.equal(calls[0][0], '/api/device-policies');
  assert.deepEqual(calls[0][1], { phoneId: base.id, dailyLimit: 80, useGlobalQuota: false, minIntervalSeconds: 25, adaptiveEnabled: true, paused: true, warmupAction: 'start' });
  assert.equal(reloads, 1);
  await formFor({ ...base, warmupStartedAt: '2026-10-15' }).props.onFinish({ ...values, followGlobal: true, warmupEnabled: true });
  assert.equal(calls[1][1].minIntervalSeconds, null);
  assert.ok(!('warmupAction' in calls[1][1]), 'Saving an active warmup must not restart it');
  await formFor({ ...base, warmupStartedAt: '2026-10-15' }).props.onFinish({ ...values, warmupEnabled: false });
  assert.equal(calls[2][1].warmupAction, 'stop');
  release = {};
  const form = formFor(base), pending = form.props.onFinish(values);
  const beforeDuplicate = calls.length;
  await form.props.onFinish(values);
  assert.equal(calls.length, beforeDuplicate, 'Duplicate submission must not write twice');
  release.resolve(); await pending; release = undefined;
  const beforeFailure = reloads;
  failure = true;
  await formFor(base).props.onFinish(values);
  assert.equal(reloads, beforeFailure, 'Failed saves must not report refreshed data');
  let actionProps;
  const actions = load('src/components/phone/PhoneTableButton.tsx', {
    '@/components/ActionDropdown': { __esModule: true, default: props => { actionProps = props; return null; } },
    './PhoneConnectionStatus': { __esModule: true, default: () => null },
    'next-i18next': { useTranslation: () => ({ t: value => value }) },
    'next/router': { useRouter: () => ({ push() {} }) },
  });
  let opened = 0;
  renderToStaticMarkup(React.createElement(actions.default, { phone: { id: base.id, name: base.name }, policyAvailable: true, onPolicyClick: () => opened++ }));
  const item = actionProps.items.find(item => item.label === 'Atur batas');
  assert.equal(item.disabled, false); item.onClick(); assert.equal(opened, 1);
  renderToStaticMarkup(React.createElement(actions.default, { phone: { id: 'missing', name: 'Missing' }, policyAvailable: false }));
  assert.equal(actionProps.items.find(item => item.label === 'Atur batas').disabled, true);
  const redirect = load('src/pages/dashboard/device-health.tsx', {});
  assert.equal((await redirect.getServerSideProps()).redirect.destination, '/dashboard/phone');
  console.log('PHONE_POLICIES_PASSED: device association, health states, quota, interval, warmup lifecycle, save payloads, duplicate/error handling, action menu, legacy redirect');
})().catch(error => { console.error(error); process.exitCode = 1; });
