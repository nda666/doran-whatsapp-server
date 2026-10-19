const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const defaults = value => ({ __esModule: true, default: value });
function load(relative, stubs) {
  const filename = path.resolve(__dirname, '..', relative), module = { exports: {} };
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const realRequire = createRequire(filename);
  new Function('require', 'module', 'exports', source)(name => Object.hasOwn(stubs, name) ? stubs[name] : realRequire(name), module, module.exports);
  return module.exports.default;
}
(async () => {
  let count = 7, reads = 0;
  const handler = load('src/pages/api/admin/approval-notifications.ts', {
    '@/lib/prisma': { prisma: { user: { count: async query => { reads++; assert.deepEqual(query, { where: { approvalStatus: 'PENDING' } }); return count; } } } },
    '@/middleware/apiSuperAdminMiddleware': defaults(fn => fn),
  });
  const response = () => ({ code: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, json(v) { this.body = v; }, status(v) { this.code = v; return this; }, end() {} });
  for (const expected of [7, 0, 102]) {
    count = expected;
    const res = response(); await handler({ method: 'GET' }, res);
    assert.deepEqual(res.body, { pendingCount: expected });
    assert.equal(res.headers['Cache-Control'], 'no-store');
  }
  for (const method of ['POST', 'PATCH', 'DELETE']) {
    const res = response(); await handler({ method }, res); assert.equal(res.code, 405);
  }
  assert.equal(reads, 3);
  let data, error = '';
  const h = React.createElement;
  const Component = load('src/components/ApprovalNotifications.tsx', {
    '@/lib/useDashboardApi': { useDashboardApi: (url, poll) => {
      assert.equal(url, '/api/admin/approval-notifications'); assert.equal(poll, 30000);
      return { data, error, reload: () => {} };
    } },
    'next/link': defaults(p => h('a', { href: p.href }, p.children)),
    'antd': {
      Popover: p => h('div', null, p.children, p.content),
      Space: p => h('div', null, p.children),
      Badge: p => h('div', { 'data-count': p.count }, p.children),
      Button: p => h('button', { 'aria-label': p['aria-label'] }, p.icon),
    },
  });
  for (const expected of [0, 7, 102]) {
    data = { pendingCount: expected };
    const html = renderToStaticMarkup(h(Component));
    assert(html.includes(`data-count="${expected}"`));
    assert(html.includes('href="/dashboard/admin?tab=users&amp;status=PENDING"'));
    assert(html.includes(expected ? `${expected} pengguna menunggu persetujuan` : 'Tidak ada permintaan persetujuan user.'));
  }
  data = undefined;
  assert(renderToStaticMarkup(h(Component)).includes('Memuat notifikasi'));
  error = 'Failed';
  assert(renderToStaticMarkup(h(Component)).includes('Notifikasi belum dapat dimuat.'));
  console.log('APPROVAL_NOTIFICATIONS_OK: pending count, no-store, methods, badge, link, empty/loading/error');
})().catch(error => { console.error(error); process.exitCode = 1; });
