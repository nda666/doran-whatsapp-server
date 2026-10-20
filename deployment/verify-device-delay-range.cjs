'use strict';
// Synthetic policies only. No database, network, or WhatsApp messages.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { createRequire } = require('node:module');
let random = 0;
const math = Object.create(Math); math.random = () => random;
function loader(stubs = {}) {
  const cache = new Map();
  function load(name) {
    if (name in stubs) return stubs[name];
    if (cache.has(name)) return cache.get(name);
    const file = path.resolve(name), real = createRequire(file), module = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: 1, target: 7, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
    const req = spec => spec.endsWith('.css') ? new Proxy({}, { get: (_, key) => key === '__esModule' ? false : String(key) }) : spec in stubs ? stubs[spec] : spec.startsWith('@/') ? load('src/' + spec.slice(2) + '.ts') : spec.startsWith('.') ? load(path.posix.normalize(path.posix.join(path.posix.dirname(name), spec)) + (fs.existsSync(path.resolve(path.posix.normalize(path.posix.join(path.posix.dirname(name), spec)) + '.tsx')) ? '.tsx' : '.ts')) : real(spec);
    new Function('require', 'module', 'exports', 'Math', code)(req, module, module.exports, math);
    cache.set(name, module.exports); return module.exports;
  }
  return load;
}
const ui = (text, values = {}) => text.replace(/{{(\w+)}}/g, (_, key) => values[key]);
const base = { id: '00000000-0000-4000-8000-000000000001', name: 'Fixture', dailyLimit: 200, useGlobalQuota: true, minIntervalSeconds: null, maxIntervalSeconds: null, adaptiveEnabled: true, paused: false, health: { multiplier: 1 }, operatingHours: null, globalOperatingHours: { enabled: false, start: '08:00', end: '20:00' }, operatingHoursState: { open: true, nextOpenAt: null }, globalInterval: { minSeconds: 12, maxSeconds: 18 } };
async function main() {
  let stored, scoped = 0;
  const api = loader({
    'src/middleware/apiAuthMiddleware.ts': { default: fn => fn, __esModule: true },
    'src/lib/prisma.ts': { prisma: { phone: { findFirst: async () => { scoped++; return { id: base.id }; } }, deviceSendPolicy: { upsert: async args => { stored = args; return args.update; } } } },
    'src/lib/access.ts': { ownerScope: () => ({ userId: 'owner' }) },
    'src/server/messaging/safety.ts': {}, 'src/server/dispatch/settings.ts': {},
  })('src/pages/api/device-policies.ts').default;
  async function save(values) {
    const result = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, setHeader() {}, end() {} };
    await api({ method: 'PUT', user: { id: 'owner' }, body: { phoneId: base.id, dailyLimit: 200, useGlobalQuota: true, adaptiveEnabled: true, paused: false, ...values } }, result);
    return result;
  }
  for (const [min, max] of [[2, 5], [5, 5], [1, 30], [null, null]]) {
    assert.equal((await save({ minIntervalSeconds: min, maxIntervalSeconds: max })).statusCode, 200);
    assert.equal(stored.update.maxIntervalSeconds, max);
  }
  const before = scoped;
  for (const [min, max] of [[5, 2], [0, 2], [1, 31], [1.5, 3], [1, 2.5], [null, 5]]) assert.equal((await save({ minIntervalSeconds: min, maxIntervalSeconds: max })).statusCode, 400);
  assert.equal(scoped, before, 'Invalid ranges must not reach database writes');

  const React = require('react'); let submitted;
  const controls = loader({
    antd: { ...require('antd'), message: { success() {}, error() {} } },
    react: { ...React, useMemo: fn => fn(), useRef: value => ({ current: value }), useState: initial => [initial === undefined ? base : initial, () => {}] },
    axios: { default: { put: async (_, body) => { submitted = body; } }, __esModule: true },
    'src/lib/uiTranslation.ts': { useUiTranslation: () => ui },
    'src/lib/useDashboardApi.ts': { useDashboardApi: () => ({ data: [base], reload() {}, headers: {} }) },
  })('src/components/phone/PhonePolicyControls.tsx');
  const form = controls.default().modal.props.children;
  assert.equal(form.props.initialValues.minIntervalSeconds, 12);
  assert.equal(form.props.initialValues.maxIntervalSeconds, 18);
  await form.props.onFinish({ followGlobal: false, minIntervalSeconds: 2, maxIntervalSeconds: 5 });
  assert.equal(submitted.minIntervalSeconds, 2); assert.equal(submitted.maxIntervalSeconds, 5);
  await form.props.onFinish({ followGlobal: true, minIntervalSeconds: 2, maxIntervalSeconds: 5 });
  assert.equal(submitted.minIntervalSeconds, null); assert.equal(submitted.maxIntervalSeconds, null);
  const children = React.Children.toArray(form.props.children.props.children);
  const dependent = children.find(child => typeof child.props.children === 'function' && child.props.shouldUpdate({ followGlobal: true }, { followGlobal: false }));
  assert.equal(dependent.props.children({ getFieldValue: () => true }), false);
  const fields = React.Children.toArray(dependent.props.children({ getFieldValue: () => false }).props.children);
  assert.deepEqual(fields.map(field => field.props.label), ['Mulai (detik)', 'Hingga (detik)']);
  const validator = fields[1].props.rules[1]({ getFieldValue: () => 5 }).validator;
  await assert.rejects(validator(null, 4)); await validator(null, 5);
  const cell = controls.phonePolicyColumns(ui, () => ({ ...base, minIntervalSeconds: 2, maxIntervalSeconds: 5 })).find(column => column.key === 'sendInterval').render(null, { id: base.id });
  assert.match(require('react-dom/server').renderToStaticMarkup(cell), /Khusus: 2–5 detik/);

  ui.date = value => new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));
  const sendColumn = controls.phonePolicyColumns(ui, () => ({ ...base, lastSendProcessedAt: '2026-10-20T01:23:00Z' }), { sort: 'lastSendProcessedAt', order: 'desc' }).find(column => column.key === 'lastSendProcessedAt');
  assert.equal(sendColumn.sortOrder, 'descend');
  assert.match(require('react-dom/server').renderToStaticMarkup(sendColumn.render(null, { id: base.id })), /08.23 WIB/);
  const emptySend = controls.phonePolicyColumns(ui, () => base).find(column => column.key === 'lastSendProcessedAt');
  assert.match(require('react-dom/server').renderToStaticMarkup(emptySend.render(null, { id: base.id })), /Belum tercatat/);

  const policy = { ...base, nextAllowedAt: new Date(0), warmupStartedAt: null };
  const usage = { attempts: 0, failures: 0 };
  const db = {
    deviceSendPolicy: { createMany: async () => {}, findUniqueOrThrow: async () => policy, update: async ({ data }) => Object.assign(policy, data) },
    deviceDailyUsage: { upsert: async () => usage, update: async () => { usage.attempts++; } },
    phone: { update: async () => {} },
    $queryRaw: async () => [], $transaction: fn => fn(db),
  };
  const safety = loader({
    'src/lib/prisma.ts': { prisma: db }, 'src/server/dispatchWebhook/events.ts': {},
    'src/server/dispatch/settings.ts': { getWarmupDailyLimits: async () => [25, 50, 100, 200, 400, 800], getGlobalOperatingHours: async () => ({ enabled: false, start: '08:00', end: '20:00' }), getGlobalDeviceQuota: async () => 200, getDispatchDelayRange: async () => base.globalInterval },
  })('src/server/messaging/safety.ts');
  async function gap(min, max, rng, attempts = 0, failures = 0, adaptive = true) {
    Object.assign(policy, { minIntervalSeconds: min, maxIntervalSeconds: max, nextAllowedAt: new Date(0), adaptiveEnabled: adaptive });
    Object.assign(usage, { attempts, failures }); random = rng;
    const before = Date.now(); await safety.reserveSend('owner', base.id, 'fixture@g.us');
    const after = Date.now(); return [policy.nextAllowedAt.getTime() - after, policy.nextAllowedAt.getTime() - before];
  }
  async function expectGap(args, expected) { const [low, high] = await gap(...args); assert(low <= expected && high >= expected, `${args}: expected ${expected}, got ${low}–${high}`); }
  await expectGap([2, 5, 0], 2000); await expectGap([2, 5, .999999], 5000);
  await expectGap([20, 25, 0], 20000); await expectGap([5, 5, .5], 5000);
  await expectGap([null, null, 0], 12000); await expectGap([null, null, .999999], 18000);
  await expectGap([5, null, 0], 12000); await expectGap([30, null, .5], 30000);
  await expectGap([17, null, .5], 17000);
  await expectGap([2, 5, 0, 20, 2], 6000); await expectGap([2, 5, 0, 20, 2, false], 2000);
  console.log('DEVICE_DELAY_RANGE_PASSED: UI fields, payloads, validation, API persistence, independent custom range, global fallback, legacy policy compatibility and adaptive delays');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
