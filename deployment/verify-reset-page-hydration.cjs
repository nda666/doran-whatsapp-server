const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const token = 'a'.repeat(64);
let calls = 0;
global.window = { location: { hash: '#token=' + token, pathname: '/reset-password', search: '' }, history: { state: { __N: true }, replaceState(state) { assert.deepEqual(state, { __N: true }); window.location.hash = ''; calls++; } } };
const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/pages/reset-password.tsx'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
let states, effects, index;
const jsx = (type, props) => ({ type, props });
const stubs = {
  'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
  react: { useState(initial) { const slot = index++; states[slot] = initial; return [initial, value => { states[slot] = value; }]; }, useRef: value => ({ current: value }), useEffect: fn => effects.push(fn) },
  antd: { Alert: 'Alert', Button: 'Button', Form: Object.assign('Form', {}), Input: {}, Space: 'Space' },
  axios: { __esModule: true, default: { post: async (_, body) => { assert.equal(body.token, token); return { data: { message: 'Password updated' } }; } } },
  'next/head': { __esModule: true, default: 'Head' }, 'next/link': { __esModule: true, default: 'Link' },
  'next-i18next/serverSideTranslations': {}, '@/components/GuestLayout': {},
};
const moduleFixture = { exports: {} };
new Function('require', 'module', 'exports', source)(name => { assert(name in stubs, name); return stubs[name]; }, moduleFixture, moduleFixture.exports);
function mount() { states = []; effects = []; index = 0; const tree = moduleFixture.exports.default(); effects.forEach(fn => fn()); return { states: [...states], tree }; }
(async () => {
  const first = mount(); assert.equal(first.states[0], token); assert.equal(first.states[1], true); assert.equal(calls, 0);
  const second = mount(); assert.equal(second.states[0], token); assert.equal(second.states[1], true); assert.equal(calls, 0);
  // Invoke the submit closure after its state has been populated by the effect.
  const originalUseState = stubs.react.useState;
  index = 0; stubs.react.useState = initial => { const slot = index++; return [slot === 0 ? token : slot === 1 ? true : initial, value => { states[slot] = value; }]; };
  const tree = moduleFixture.exports.default();
  const find = node => { if (!node || typeof node !== 'object') return null; if (node.props?.onFinish) return node.props.onFinish; const children = node.props?.children; for (const child of Array.isArray(children) ? children : [children]) { const found = find(child); if (found) return found; } return null; };
  const submit = find(tree); assert(submit); await submit({ password: 'new-password-123', passwordConfirm: 'new-password-123' });
  assert.equal(calls, 1); assert.equal(window.location.hash, ''); assert.equal(states[3], true);
  stubs.react.useState = originalUseState;
  window.location.hash = ''; assert.equal(mount().states[0], '');
  console.log('RESET_PAGE_HYDRATION_OK: token survives repeated page mounts; fragment cleared only after successful reset; Next.js history state preserved.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { delete global.window; });
