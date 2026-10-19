const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { createRequire } = require('node:module');
function load(relative, stubs = {}) {
  const filename = path.resolve(__dirname, '..', relative), module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const realRequire = createRequire(filename);
  new Function('require', 'module', 'exports', source)(name => Object.hasOwn(stubs, name) ? stubs[name] : realRequire(name), module, module.exports);
  return module.exports;
}
const defaults = value => ({ __esModule: true, default: value });
const access = load('src/lib/access.ts');
const admin = { id: 'admin', role: 'ADMIN', email: 'admin@gmail.com', approvalStatus: 'APPROVED' };
const normal = { id: 'normal', role: 'USER', email: 'normal@example.com', approvalStatus: 'APPROVED' };
function response() { return { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, setHeader() {} }; }
(async () => {
  const fixtures = [
    { id: '1', userId: 'normal', name: 'Device 1', user: { id: 'normal', name: 'Pemilik Satu', email: 'owner-one@example.com' } },
    { id: '2', userId: 'admin', name: 'Device 2', user: { id: 'admin', name: 'Pemilik Dua', email: 'owner-two@example.com' } },
  ];
  let query;
  const prisma = { phone: {
    findMany: async args => {
      query = args;
      if (args.include) assert.deepEqual(args.include.user.select, { id: true, name: true, email: true });
      return fixtures.filter(row => !args.where.userId || row.userId === args.where.userId).map(({ user, ...row }) => ({ ...row, ...(args.include ? { user } : {}) }));
    }, count: async () => fixtures.length,
  }, waDispatch: { groupBy: async () => [] } };
  const handler = load('src/pages/api/phones/index.ts', {
    '@/server/deviceWebhook/events': load('src/server/deviceWebhook/events.ts'),
    '@/lib/prisma': { prisma }, '@/lib/access': access,
    '@/lib/tableQuery': load('src/lib/tableQuery.ts'), '@/middleware/apiAuthMiddleware': defaults(fn => fn),
  }).default;
  let res = response(); await handler({ method: 'GET', user: admin, query: { page: '1', sort: 'user.name', order: 'asc' } }, res);
  assert.equal(res.body.data.length, 2); assert(res.body.data.every(row => row.user?.email));
  assert.deepEqual(query.orderBy, [{ user: { name: 'asc' } }, { id: 'asc' }]);
  for (const user of [normal, { ...admin, email: 'other-admin@example.com' }]) {
    res = response(); await handler({ method: 'GET', user, query: { page: '1', sort: 'user.name' } }, res);
    assert.equal(query.where.userId, user.id); assert.equal(query.include, undefined);
    assert(res.body.data.every(row => row.userId === user.id && !('user' in row)));
    assert(!JSON.stringify(query.orderBy).includes('user'));
  }
  const search = load('src/lib/phoneSearchState.ts');
  const state = search.readPhoneSearchState({ sort: 'user.name', order: 'asc' });
  assert.equal(search.phoneSearchQuery(state).sort, 'user.name');
  const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
  const h = React.createElement, Empty = () => null, Box = props => h('div', null, props.children);
  let sessionUser = admin;
  function FakeTable({ columns, dataSource }) {
    const heading = h('thead', null, h('tr', null, columns.map((column, index) => h('th', { key: index }, column.title))));
    const rows = dataSource.map(row => h('tr', { key: row.id }, columns.map((column, index) => {
      const value = Array.isArray(column.dataIndex) ? column.dataIndex.reduce((item, key) => item?.[key], row) : row[column.dataIndex];
      return h('td', { key: index }, column.render ? column.render(value, row) : value);
    })));
    return h('table', null, heading, h('tbody', null, rows));
  }
  const page = load('src/pages/dashboard/phone.tsx', {
    '@/components/DashboardTable': defaults(FakeTable),
    '@/lib/useTableState': { useTableState: () => ({ page: 1, limit: 5 }) },
    '@/lib/phoneSearchState': search, '@/lib/access': access,
    'next-auth/react': { useSession: () => ({ data: { user: sessionUser } }) },
    'next/router': { useRouter: () => ({ query: {}, pathname: '/dashboard/phone' }) },
    'next-i18next': { useTranslation: () => ({ t: key => key }), i18n: { t: key => key } },
    'next-i18next/serverSideTranslations': {},
    'antd': { Alert: Empty, Button: Box, Flex: Box, Space: Box, Switch: Empty, Tag: Box, Modal: { useModal: () => [null, null] }, notification: { useNotification: () => [null, null] } },
    '@/components/Layout': defaults(Empty), '@/components/phone/ModalQrCode': defaults(Empty), '@/components/phone/TestSendModal': defaults(Empty),
    '@/components/phone/PhoneFormModal': defaults(React.forwardRef(Empty)), '@/components/phone/PhoneTableButton': defaults(Empty), '@/components/phone/SearchPhoneForm': defaults(Empty),
    '@/lib/usePhoneData': defaults(() => ({ phones: fixtures, total: 2 })), '@/lib/useSocket': defaults(() => ({})), '@/utils/copyToClipboard': {},
  }).default;
  let html = renderToStaticMarkup(h(page));
  assert(html.includes('Kepemilikan')); assert(html.includes('Pemilik Satu')); assert(html.includes('owner-one@example.com'));
  for (const user of [normal, { ...admin, email: 'other-admin@example.com' }, { ...admin, approvalStatus: 'REJECTED' }]) {
    sessionUser = user; html = renderToStaticMarkup(h(page));
    assert(!html.includes('Kepemilikan')); assert(!html.includes('owner-one@example.com'));
  }
  console.log('PHONE_OWNERSHIP_OK: admin column/name/email, user column hidden, server owner projection/scoping, admin-only sorting and URL state');
})().catch(error => { console.error(error); process.exitCode = 1; });
