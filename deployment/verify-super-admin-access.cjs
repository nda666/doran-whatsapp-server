const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const ts = require('typescript');
function load(relative, stubs = {}) {
  const filename = path.resolve(__dirname, '..', relative), module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const realRequire = createRequire(filename);
  new Function('require', 'module', 'exports', source)(name => {
    if (Object.hasOwn(stubs, name)) return stubs[name];
    if (name.startsWith('@/server/')) return {};
    return realRequire(name);
  }, module, module.exports);
  return module.exports;
}
const defaults = value => ({ __esModule: true, default: value });
const access = load('src/lib/access.ts');
const admin = { id: 'super', email: 'admin@gmail.com', role: 'ADMIN', approvalStatus: 'APPROVED' };
const user = { id: 'user', email: 'user@example.invalid', role: 'USER', approvalStatus: 'APPROVED' };
const otherAdmin = { ...user, role: 'ADMIN' };
let actor, session, accountReads = 0;
const blockedDb = new Proxy({}, { get: () => () => { throw new Error('Protected data accessed'); } });
const prisma = new Proxy({ user: { ...blockedDb, findFirst: async () => { accountReads++; return actor; }, findUnique: async () => actor } }, {
  get: (target, key) => target[key] || blockedDb,
});
const auth = load('src/middleware/apiAuthMiddleware.ts', {
  '../lib/prisma': { prisma }, '../lib/access': access, 'next-auth/jwt': { getToken: async () => session },
}).default;
const guard = load('src/middleware/apiSuperAdminMiddleware.ts', {
  '../lib/access': access, './apiAuthMiddleware': defaults(auth),
}).default;
function response() {
  return { code: 200, headers: {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, end() { return this; }, setHeader(key, value) { this.headers[key] = value; } };
}
function request(method = 'GET', bearer = true) {
  return { method, query: {}, body: {}, headers: bearer ? { authorization: 'Bearer fixture' } : {} };
}
(async () => {
  process.env.NEXTAUTH_URL = 'https://dashboard.example.invalid';
  const routes = ['users', 'users/[id]/approval', 'users/[id]/active', 'approval-notifications', 'plans', 'settings', 'update', 'dispatch-webhook', 'device-webhook', 'webhook-logs'];
  for (const route of routes) {
    const handler = load(`src/pages/api/admin/${route}.ts`, {
      '@/lib/prisma': { prisma }, '@/lib/access': access, '@/middleware/apiSuperAdminMiddleware': defaults(guard),
      '@/lib/tableQuery': load('src/lib/tableQuery.ts'),
    }).default;
    for (const denied of [user, otherAdmin, { ...admin, role: 'USER' }, { ...admin, approvalStatus: 'PENDING' }, { ...admin, approvalStatus: 'REJECTED' }, { ...admin, isActive: false }]) {
      actor = denied;
      for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
        const res = response(); await handler(request(method), res);
        assert.equal(res.code, 403, `${route}: ${denied.email} ${method}`);
      }
    }
    actor = null;
    let res = response(); await handler(request(), res); assert.equal(res.code, 401);
    actor = admin;
    res = response(); await handler(request('OPTIONS'), res); assert.equal(res.code, 405, `${route}: super admin reaches handler`);
  }
  let ran = 0;
  const protectedHandler = guard(() => { ran++; });
  actor = admin; session = { id: admin.id, role: 'ADMIN', email: admin.email };
  await protectedHandler(request('GET', false), response()); assert.equal(ran, 1);
  // The database overrides old claims immediately after demotion.
  actor = otherAdmin;
  let res = response(); await protectedHandler(request('GET', false), res); assert.equal(res.code, 403); assert.equal(ran, 1);
  actor = admin;
  res = response(); await protectedHandler(request('POST', false), res); assert.equal(res.code, 403);
  const trusted = request('POST', false); trusted.headers.origin = process.env.NEXTAUTH_URL;
  await protectedHandler(trusted, response()); assert.equal(ran, 2);
  assert(accountReads > 100);
  const queueApi = load('src/pages/api/bull-queue.ts', {
    '@/middleware/apiSuperAdminMiddleware': defaults(guard), '../../lib/queues/sendWaQueue': defaults(null),
  }).default;
  const legacyUserApi = load('src/pages/api/user.ts', { '@/middleware/apiSuperAdminMiddleware': defaults(guard) }).default;
  for (const handler of [queueApi, legacyUserApi]) {
    actor = null; res = response(); await handler(request(), res); assert.equal(res.code, 401);
    for (const denied of [user, otherAdmin]) {
      actor = denied; res = response(); await handler(request(), res); assert.equal(res.code, 403);
    }
  }
  actor = admin; res = response(); await queueApi(request(), res); assert.equal(res.code, 503);
  res = response(); await legacyUserApi(request(), res); assert.equal(res.code, 200);

  const props = load('src/lib/superAdminPageProps.ts', {
    './prisma': { prisma }, './access': access, 'next-auth/jwt': { getToken: async () => session },
    'next-i18next/serverSideTranslations': { serverSideTranslations: async () => ({ translated: true }) },
  }).superAdminPageProps;
  for (const page of ['admin', 'plans']) {
    assert(fs.readFileSync(path.resolve(__dirname, `../src/pages/dashboard/${page}.tsx`), 'utf8').includes('getServerSideProps = superAdminPageProps'));
  }
  for (const denied of [user, otherAdmin]) {
    actor = denied; assert.equal((await props({ req: {}, res: response(), locale: 'id' })).redirect.destination, '/dashboard');
  }
  actor = null; assert.equal((await props({ req: {}, res: response() })).redirect.destination, '/signin');
  actor = admin; assert.equal((await props({ req: {}, res: response(), locale: 'id' })).props.translated, true);

  const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
  const h = React.createElement, Box = p => h('div', null, p.children), Empty = () => null;
  let pathname = '/dashboard', sessionStatus = 'authenticated';
  const Layout = load('src/components/Layout.tsx', {
    '@/components/ApprovalNotifications': defaults(() => h('button', null, 'APPROVAL_NOTIFICATIONS')),
    '@/lib/access': access,
    'next-auth/react': { useSession: () => ({ data: actor ? { user: actor } : null, status: sessionStatus }) },
    'next/router': { useRouter: () => ({ pathname, locale: 'id' }) },
    'next/link': defaults(p => h('a', { href: p.href }, p.children)),
    'next-i18next': { useTranslation: () => ({ t: key => key }) },
    '@/lib/DashboardPreferences': { useDashboardPreferences: () => ({ dark: false }) },
    'antd': { Layout: Object.assign(Box, { Header: Box, Sider: Box, Content: Box }), Menu: p => h('nav', null, p.items.map(item => h('span', { key: item.key }, item.label))), Avatar: Box, Button: Box, Dropdown: Box, Space: Box, Input: { Search: Empty }, Select: Empty, Breadcrumb: Empty, Alert: p => h('div', null, p.message), Spin: Empty },
  }).default;
  for (const permitted of [user, otherAdmin, admin]) {
    actor = permitted; pathname = '/dashboard';
    const html = renderToStaticMarkup(h(Layout, {}, 'OPERATIONAL_CONTENT'));
    for (const route of ['campaigns', 'dispatch', 'reports', 'log', 'contacts', 'media', 'phone', 'api-docs']) assert(html.includes(`href="/dashboard/${route}"`));
    assert.equal(html.includes('href="/dashboard/admin"'), permitted === admin);
    assert.equal(html.includes('href="/dashboard/plans"'), permitted === admin);
    assert.equal(html.includes('APPROVAL_NOTIFICATIONS'), permitted === admin);
  }
  for (const restricted of ['/dashboard/admin', '/dashboard/plans']) {
    pathname = restricted; actor = otherAdmin;
    let html = renderToStaticMarkup(h(Layout, {}, 'PROTECTED_CONTENT')); assert(!html.includes('PROTECTED_CONTENT'));
    actor = null; sessionStatus = 'loading';
    html = renderToStaticMarkup(h(Layout, {}, 'PROTECTED_CONTENT')); assert(!html.includes('PROTECTED_CONTENT'));
    actor = admin; sessionStatus = 'authenticated';
    html = renderToStaticMarkup(h(Layout, {}, 'PROTECTED_CONTENT')); assert(html.includes('PROTECTED_CONTENT'));
  }
  const queue = load('src/server/queueAccess.ts', { '../middleware/apiSuperAdminMiddleware': defaults(guard) }).queueAccess;
  actor = otherAdmin; res = response(); queue(request(), res, () => { throw new Error('Queue access leaked'); });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(res.code, 403);
  actor = admin; let continued = false; queue(request(), response(), () => { continued = true; });
  await new Promise(resolve => setImmediate(resolve)); assert(continued);
  assert(fs.readFileSync(path.resolve(__dirname, '../src/server/index.ts'), 'utf8').includes('app.use("/queues", queueAccess,'));
  console.log('SUPER_ADMIN_ACCESS_OK: menu, direct pages, all admin API methods, stale sessions, queue console, CSRF');
})().catch(error => { console.error(error); process.exitCode = 1; });
