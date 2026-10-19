const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const ts = require('typescript');
const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const defaults = value => ({ __esModule: true, default: value });
const h = React.createElement, Box = p => h('div', null, p.children), Empty = () => null;
let menu, calls = 0, resolveLogout, rejectLogout, errors = 0;
function load(relative, stubs) {
  const filename = path.resolve(__dirname, '..', relative), module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const real = createRequire(filename);
  new Function('require', 'module', 'exports', source)(name => Object.hasOwn(stubs, name) ? stubs[name] : real(name), module, module.exports);
  return module.exports;
}
const Layout = load('src/components/Layout.tsx', {
  '@/components/ApprovalNotifications': defaults(Empty),
  '@/lib/access': { isSuperAdmin: () => false, isSuperAdminPage: () => false },
  'next-auth/react': { useSession: () => ({ data: { user: { id: 'fixture', name: 'Fixture', email: 'fixture@example.invalid' } }, status: 'authenticated' }),
    signOut: options => { assert.deepEqual(options, { callbackUrl: '/signin', redirect: true }); calls++; return new Promise((resolve, reject) => { resolveLogout = resolve; rejectLogout = reject; }); } },
  'next/router': { useRouter: () => ({ pathname: '/dashboard', locale: 'id' }) },
  'next/link': defaults(p => h('a', { href: p.href }, p.children)),
  'next-i18next': { useTranslation: () => ({ t: key => key }) },
  '@/lib/DashboardPreferences': { useDashboardPreferences: () => ({ dark: false }) },
  antd: { Layout: Object.assign(Box, { Header: Box, Sider: Box, Content: Box }), Menu: Empty, Avatar: Box, Button: Box, Space: Box,
    Dropdown: p => { menu = p.menu; return h(Box, {}, p.children); }, Input: { Search: Empty }, Select: Empty, Breadcrumb: Empty, Alert: Empty, Spin: Empty, message: { error: () => errors++ } },
}).default;
(async () => {
  renderToStaticMarkup(h(Layout, {}, 'content'));
  const action = menu.items.find(item => item.key === 'signout'); assert.equal(typeof action.onClick, 'function'); assert.equal(typeof action.label, 'string');
  action.onClick(); action.onClick(); assert.equal(calls, 1, 'Duplicate logout clicks must make only one request');
  rejectLogout(new Error('network failure')); await new Promise(resolve => setImmediate(resolve)); assert.equal(errors, 1);
  action.onClick(); assert.equal(calls, 2, 'Failed logout can be retried'); resolveLogout();
  console.log('NAVBAR_LOGOUT_OK: menu directly calls NextAuth logout, redirects to login, suppresses duplicate requests and handles retry after failure.');
})().catch(error => { console.error(error); process.exitCode = 1; });
