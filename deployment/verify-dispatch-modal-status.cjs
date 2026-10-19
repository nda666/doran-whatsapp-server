const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
function load(file, stubs) {
  const moduleCopy = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: 1, target: 7, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  new Function('require','module','exports',code)(name => name in stubs ? stubs[name] : require(name), moduleCopy, moduleCopy.exports);
  return moduleCopy.exports;
}
const presentation = load('src/lib/dispatchPresentation.ts', {});
let data, error = '';
const wrapper = ({ children }) => React.createElement('div', null, children);
const antd = {
  Modal: wrapper, Space: wrapper, Tag: wrapper, Spin: () => React.createElement('div', null, 'Loading'),
  Typography: { Text: wrapper, Link: wrapper },
  Alert: ({ message, description }) => React.createElement('div', null, message, description),
  Descriptions: ({ items }) => React.createElement('div', null, items.map(item => React.createElement('div', { key: item.key }, item.label, ': ', item.children))),
};
const Modal = load('src/components/DispatchMessageModal.tsx', {
  antd, '@/lib/dispatchPresentation': presentation,
  '@/lib/useDashboardApi': { useDashboardApi: (url, poll) => {
    assert.equal(url, '/api/dispatch?id=job'); assert.equal(poll, 5000); return { data, error };
  } },
}).default;
const render = () => renderToStaticMarkup(React.createElement(Modal, { id: 'job', onClose() {} }));
for (const [status, expected] of Object.entries(presentation.dispatchStatusInfo)) {
  data = { id: 'job', status, recipient: 'recipient', content_available: true, message: 'stored text' };
  const html = render();
  assert(html.includes('Status pengiriman')); assert(html.includes(expected.label)); assert(html.includes(expected.description)); assert(html.includes('stored text'));
  if (status === 'READ') assert(!html.includes('belum dikonfirmasi terkirim'));
}
data.content_available = false; assert(render().includes('Isi pesan sudah dihapus'));
data = { id: 'different-job', status: 'READ' }; assert(render().includes('Loading')); assert(!render().includes('dibaca oleh penerima'));
error = 'Access denied'; assert(render().includes(error));
console.log('DISPATCH_MODAL_STATUS_OK_ALL_SEVEN_STATUSES_POLLING_CONTENT_RETENTION_STALE_ID_ERROR');
