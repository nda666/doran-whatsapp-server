const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(name, mocks) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', name), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: key => key in mocks ? mocks[key] : require(key), process: { env: {} }, setTimeout, clearTimeout, console });
  return exports;
}
const { phoneCleanupSchema, defaultCleanupOptions } = load('src/lib/phoneCleanup.ts', {});
const empty = Object.fromEntries(Object.keys(defaultCleanupOptions).map(k => [k, false]));
assert.equal(phoneCleanupSchema.safeParse(empty).success, false);
assert.equal(phoneCleanupSchema.safeParse({ ...empty, clearAuth: true }).success, false);
assert.equal(phoneCleanupSchema.safeParse({ ...empty, deleteRecord: true }).success, false);
assert.equal(phoneCleanupSchema.safeParse(defaultCleanupOptions).success, true);

async function scenario(options, { missing = false, busy = false, logoutFail = false, scopeOwner = 'owner', unsafeAuth = false } = {}) {
  let phone = missing ? null : { id: 'phone', userId: 'owner', name: 'Kasir', active: 1, token: 'old-token', number: '628123', account_name: 'Old', webhookUrl: 'https://example.com' };
  let contacts = 3, replies = 2, history = 4, ended = false, loggedOut = false, removed = false;
  let leaseToken = null;
  const events = [];
  const socket = { user: { id: '628123' }, ws: { isOpen: true }, ev: { removeAllListeners() {} },
    async logout() { if (logoutFail) throw new Error('NETWORK'); loggedOut = true; }, end() { ended = true; } };
  const sessions = new Map([['phone', socket]]), maintenance = new Set(), retired = new WeakSet();
  const p = {
    phone: { findFirst: async ({ where }) => phone && (!where.userId || where.userId === phone.userId) ? { ...phone } : null,
      update: async ({ data }) => (phone = { ...phone, ...data }), updateMany: async ({ data }) => { if (phone) phone = { ...phone, ...data }; return { count: 1 }; },
      delete: async () => { phone = null; } },
    waSenderLease: { upsert: async () => {}, updateMany: async ({ where, data }) => {
      if (where.OR) { if (busy) return { count: 0 }; leaseToken = data.leaseToken; return { count: 1 }; }
      if (where.leaseToken === leaseToken) leaseToken = null; return { count: 1 };
    }, deleteMany: async () => { leaseToken = null; } },
    chatMessage: { count: async () => 0, findMany: async () => [] },
    chatConversation: { deleteMany: async () => {} },
    waDispatch: { count: async () => 0, deleteMany: async () => { history = 0; } },
    deviceContact: { deleteMany: async () => { contacts = 0; } }, autoReply: { deleteMany: async () => { replies = 0; } },
    $queryRaw: async () => [], $executeRaw: async () => 0, $transaction: async callback => callback(p),
  };
  const service = load('src/server/cleanupPhone.ts', {
    '../lib/prisma': { prisma: p }, './libs/makeWASocket': { session: sessions, waitForAuthSave: async () => {}, waitForPendingSocket: async () => {} },
    './libs/phoneMaintenance': { phoneMaintenance: maintenance, retiredSockets: retired },
    './events/connectionUpdate': { clearPhoneReconnect() {} }, './libs/pairingState': { clearPairingProgress() {} },
    './chat/media': { chatMediaPath: name => name },
    './deviceWebhook/events': { enqueueDeviceEvent: async (_, event) => events.push(event) },
    'node:fs/promises': { lstat: async () => { if (unsafeAuth) return { isSymbolicLink: () => true, isDirectory: () => true }; const error = new Error(); error.code = 'ENOENT'; throw error; }, realpath: async value => value,
      rm: async target => { assert.equal(path.basename(target), 'owner-phone'); removed = true; } },
  });
  let error;
  await assert.rejects(() => service.authFolderTarget('../outside', 'phone'), /ID perangkat tidak valid/);
  try { await service.cleanupPhone('phone', { userId: scopeOwner }, options); } catch (e) { error = e; }
  assert.equal(maintenance.size, 0, 'maintenance lock released even on failure');
  assert.equal(leaseToken, null, 'cleanup sender lease released');
  return { phone, contacts, replies, history, ended, loggedOut, removed, events, error };
}
(async () => {
  const calls = [];
  const handler = load('src/pages/api/phones/[id].ts', {
    '@/lib/access': { ownerScope: user => ({ userId: user.id }) },
    '@/middleware/apiAuthMiddleware': fn => fn,
    '@/lib/phoneCleanup': load('src/lib/phoneCleanup.ts', {}),
    '@/server/cleanupPhone': { PhoneCleanupError: class extends Error {}, cleanupPhone: async (...args) => { calls.push(args); return { result: true }; } },
  }).default;
  const request = (method, body) => ({ method, body, query: { id: '11111111-1111-4111-8111-111111111111' }, user: { id: 'owner' } });
  const response = () => ({ code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, end() { return this; } });
  let res = response(); await handler(request('POST', empty), res); assert.equal(res.code, 400); assert.equal(calls.length, 0);
  res = response(); await handler(request('POST', { ...defaultCleanupOptions, userId: 'other' }), res); assert.equal(res.code, 400);
  res = response(); await handler(request('POST', defaultCleanupOptions), res); assert.equal(calls[0][1].userId, 'owner'); assert.equal(calls[0][2].deleteRecord, false);
  res = response(); await handler(request('DELETE'), res); assert.equal(calls[1][2].deleteRecord, true); assert.equal(calls[1][2].clearAuth, true);
  res = response(); await handler(request('GET'), res); assert.equal(res.code, 405);
  // Exercise the actual component handlers: choices -> summary -> explicit confirmation.
  const hookState = []; let cursor = 0, confirmation, submitted;
  const hooks = {
    useState(initial) { const index = cursor++; if (!(index in hookState)) hookState[index] = initial; return [hookState[index], next => { hookState[index] = typeof next === 'function' ? next(hookState[index]) : next; }]; },
    useRef(initial) { const index = cursor++; if (!(index in hookState)) hookState[index] = { current: initial }; return hookState[index]; },
  };
  const FakeModal = Object.assign(() => null, { useModal: () => [{ confirm: options => { confirmation = options; } }, null] });
  const Component = load('src/components/phone/PhoneCleanupModal.tsx', { react: hooks,
    antd: { Modal: FakeModal, Checkbox: 'checkbox', Alert: 'alert', Space: 'space', Typography: { Paragraph: 'paragraph' } }, '@/lib/phoneCleanup': { cleanupLabels: load('src/lib/phoneCleanup.ts', {}).cleanupLabels, defaultCleanupOptions } }).default;
  const props = { phone: { id: 'phone', name: 'Kasir' }, onCancel() {}, onSubmit: async options => { submitted = options; } };
  const render = () => { cursor = 0; return Component(props); };
  const elements = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(elements) : [node, ...elements(node.props?.children)];
  let tree = elements(render());
  let boxes = tree.filter(node => node.type === 'checkbox');
  assert.equal(boxes.length, 10); assert.equal(boxes[9].props.checked, false);
  assert.ok(boxes.slice(1, 9).every(box => box.props.checked), 'default resets without deleting row');
  boxes[7].props.onChange({ target: { checked: false } });
  tree = elements(render());
  tree.find(node => node.type === FakeModal).props.onOk();
  assert.equal(submitted, undefined, 'first Submit only opens confirmation');
  assert.equal(confirmation.okText, 'Ya, jalankan');
  await confirmation.onOk(); assert.equal(submitted.deleteRecord, false); assert.equal(submitted.resetToken, false);
  boxes = elements(render()).filter(node => node.type === 'checkbox');
  boxes[9].props.onChange({ target: { checked: true } });
  boxes = elements(render()).filter(node => node.type === 'checkbox');
  assert.ok([2, 3, 6, 7].every(index => boxes[index].props.checked && boxes[index].props.disabled), 'delete dependencies cannot be unchecked');
  boxes[1].props.onChange({ target: { checked: true } });
  boxes = elements(render()).filter(node => node.type === 'checkbox');
  assert.equal(boxes[9].props.checked, false, 'reset preset clears delete row even when it was selected');
  assert.ok(boxes.slice(2, 9).every(box => box.props.checked), 'reset preset selects every cleanup option');
  boxes[1].props.onChange({ target: { checked: false } });
  boxes = elements(render()).filter(node => node.type === 'checkbox');
  assert.ok(boxes.every(box => !box.props.checked), 'unchecking reset preset clears its selections');
  boxes[0].props.onChange({ target: { checked: false } });
  tree = elements(render()); assert.equal(tree.find(node => node.type === FakeModal).props.okButtonProps.disabled, true);
  const reset = await scenario(defaultCleanupOptions);
  assert.equal(reset.error, undefined); assert.equal(reset.phone.id, 'phone'); assert.equal(reset.phone.name, 'Kasir');
  assert.equal(reset.phone.number, null); assert.equal(reset.phone.account_name, null); assert.equal(reset.phone.active, 1);
  assert.equal(reset.phone.status, 'CLOSE'); assert.equal(reset.phone.isOnline, false); assert.notEqual(reset.phone.token, 'old-token');
  assert.equal(reset.phone.webhookUrl, null); assert.equal(reset.contacts + reset.replies + reset.history, 0);
  assert.ok(reset.ended && reset.loggedOut && reset.removed); assert.deepEqual(reset.events, ['device.updated']);
  const deleted = await scenario({ ...defaultCleanupOptions, deleteRecord: true });
  assert.equal(deleted.phone, null); assert.deepEqual(deleted.events, ['device.deleted']);
  const partial = await scenario({ ...empty, clearAutoReplies: true });
  assert.equal(partial.replies, 0); assert.equal(partial.contacts, 3); assert.equal(partial.history, 4);
  assert.equal(partial.phone.token, 'old-token'); assert.equal(partial.ended, false); assert.equal(partial.removed, false);
  const tokenOnly = await scenario({ ...empty, resetToken: true });
  assert.notEqual(tokenOnly.phone.token, 'old-token'); assert.equal(tokenOnly.phone.webhookUrl, 'https://example.com');
  assert.equal(tokenOnly.ended, false); assert.equal(tokenOnly.history, 4);
  const settingsOnly = await scenario({ ...empty, resetSettings: true });
  assert.equal(settingsOnly.phone.token, 'old-token'); assert.equal(settingsOnly.phone.webhookUrl, null);
  const keepToken = await scenario({ ...defaultCleanupOptions, resetToken: false });
  assert.equal(keepToken.phone.token, 'old-token'); assert.equal(keepToken.phone.number, null); assert.equal(keepToken.phone.webhookUrl, null);
  const disconnect = await scenario({ ...empty, disconnect: true });
  assert.equal(disconnect.phone.active, 0); assert.equal(disconnect.phone.status, 'CLOSE'); assert.equal(disconnect.removed, false);
  const denied = await scenario(defaultCleanupOptions, { missing: true }); assert.equal(denied.error.status, 404); assert.equal(denied.ended, false);
  const otherOwner = await scenario(defaultCleanupOptions, { scopeOwner: 'another-owner' }); assert.equal(otherOwner.error.status, 404); assert.equal(otherOwner.phone.token, 'old-token');
  const unsafe = await scenario(defaultCleanupOptions, { unsafeAuth: true }); assert.equal(unsafe.error.status, 400); assert.equal(unsafe.removed, false);
  const busy = await scenario(defaultCleanupOptions, { busy: true }); assert.equal(busy.error.status, 409); assert.equal(busy.phone.active, 1); assert.equal(busy.removed, false);
  const failed = await scenario(defaultCleanupOptions, { logoutFail: true }); assert.ok(failed.error); assert.equal(failed.phone.active, 0); assert.equal(failed.removed, false); assert.equal(failed.history, 4);
  console.log('PHONE_CLEANUP_OK: modal choices, second confirmation, full reset, delete, selective cleanup, access denial, safe paths, busy sender, logout failure, lock release');
})().catch(error => { console.error(error); process.exitCode = 1; });
