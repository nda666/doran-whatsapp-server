const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const cache = {};
let row = null;
const identity = { __esModule: true, default: fn => fn };
const stubs = {
  '@/middleware/apiAuthMiddleware': identity,
  '@/middleware/apiSuperAdminMiddleware': identity,
  '@/lib/prisma': { prisma: { globalSetting: { findUnique: async () => row } } },
};
function load(file, overrides = {}) {
  const filename = path.resolve(file), mod = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', source)(name => {
    if (name in overrides) return overrides[name];
    if (name in stubs) return stubs[name];
    if (name.startsWith('@/')) return cache[name] ||= load('src/' + name.slice(2) + '.ts');
    return require(name);
  }, mod, mod.exports);
  return mod.exports;
}
process.env.SETTINGS_ENCRYPTION_KEY = 'test-only-phone-form-fields';
const fields = load('src/lib/phoneFormFields.ts');
assert.deepEqual(fields.parsePhoneFormFields('[]'), []);
assert.deepEqual(fields.parsePhoneFormFields('["showTyping","readReceipt"]'), ['readReceipt', 'showTyping']);
for (const invalid of ['{}', 'null', 'bad', '["unknown"]', '["readReceipt","readReceipt"]', '[true]']) assert.equal(fields.parsePhoneFormFields(invalid), null);
const settings = load('src/lib/globalSettings.ts');
const handler = load('src/pages/api/phones/form-fields.ts').default;
async function get(method = 'GET') {
  const res = { code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, end() {} };
  await handler({ method }, res); return res;
}
async function formSubmit(visible, ready = true) {
  let submitted;
  const values = { name: 'Existing device', webhookUrl: 'https://example.invalid', ...Object.fromEntries(fields.DEFAULT_PHONE_FORM_FIELDS.map(key => [key, true])) };
  const state = [visible, ready, '', 0];
  const react = { ...require('react'), forwardRef: fn => fn, useState: () => [state.shift(), () => {}], useEffect() {}, useImperativeHandle() {} };
  const antd = { ...require('antd'), Form: Object.assign(() => null, { Item: () => null, useForm: () => [{ validateFields: async () => values }] }) };
  const modal = load('src/components/phone/PhoneFormModal.tsx', { react, antd, 'next-i18next': { useTranslation: () => ({ t: value => value }) } }).default;
  const tree = modal({ open: true, onSubmit: result => { submitted = result; } });
  tree.props.onOk();
  await new Promise(resolve => setImmediate(resolve));
  const form = require('react').Children.toArray(tree.props.children).find(child => child.type === antd.Form);
  for (const child of require('react').Children.toArray(form.props.children)) {
    if (fields.DEFAULT_PHONE_FORM_FIELDS.includes(child.props.name)) assert.equal(child.props.hidden, !ready || !visible.includes(child.props.name));
  }
  return submitted;
}
(async () => {
  assert.deepEqual((await get()).body.fields, fields.DEFAULT_PHONE_FORM_FIELDS);
  row = { value: settings.encryptSetting('[]') };
  assert.deepEqual((await get()).body.fields, []);
  row = { value: settings.encryptSetting('["readReceipt"]') };
  assert.deepEqual((await get()).body.fields, ['readReceipt']);
  assert.equal((await get('POST')).code, 405);
  row = { value: settings.encryptSetting('["unknown"]') };
  assert.equal((await get()).code, 500);
  assert.deepEqual(await formSubmit([]), { name: 'Existing device', webhookUrl: 'https://example.invalid' });
  assert.equal((await formSubmit(['showTyping'])).showTyping, true);
  assert.equal(Object.hasOwn(await formSubmit(['showTyping']), 'readReceipt'), false);
  assert.equal(await formSubmit([], false), undefined);
  console.log('PHONE_FORM_FIELDS_OK: defaults, empty/subset, validation, endpoint, hidden inputs omitted, load failure blocks save');
})().catch(error => { console.error(error); process.exitCode = 1; });
