const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
let created, edited;
const tx = {
  $queryRaw: async () => [],
  user: { findUniqueOrThrow: async () => ({ deviceLimit: 100 }) },
  phone: { findFirst: async () => ({ id: 'phone', saveIncomingMessages: false }), count: async () => 0, create: async args => (created = args.data) },
};
const stubs = {
  '@/server/dispatch/settings': {}, '@/lib/tableQuery': {},
  '@/lib/access': { isSuperAdmin: () => true, ownerScope: () => ({ userId: 'owner' }) },
  '@/lib/prisma': { prisma: { $transaction: async fn => fn(tx) } },
  '@/middleware/apiAuthMiddleware': { __esModule: true, default: fn => fn },
  '@/server/deviceWebhook/events': { enqueueDeviceEvent: async () => {}, updateDevice: async (_tx, _where, data) => (edited = data) },
  '@/server/phoneConnectionInfo': {},
};
const source = ts.transpileModule(fs.readFileSync('src/pages/api/phones/index.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const mod = { exports: {} };
new Function('require','module','exports', source)(name => stubs[name] ?? require(name), mod, mod.exports);
async function post(body) {
  const res = { code: 200, setHeader() {}, status(code) { this.code=code; return this; }, json() {}, end() {} };
  await mod.exports.default({ method: 'POST', body, user: { id: 'owner' } }, res);
  assert([200,201].includes(res.code));
}
(async () => {
  await post({ name: 'New phone' });
  assert.equal(created.showOnline, true);
  for (const key of ['readReceipt','showTyping']) assert.equal(created[key], false);
  await post({ name: 'Opt out', readReceipt: false, showOnline: false, showTyping: false });
  for (const key of ['readReceipt','showOnline','showTyping']) assert.equal(created[key], false);
  await post({ name: 'Save incoming', saveIncomingMessages: true });
  assert.equal(created.saveIncomingMessages, true);
  assert(created.saveIncomingSince instanceof Date);
  await post({ id: '6f3177a2-9d54-4a62-a62c-4e0acecb06f0', name: 'Edit only name' });
  for (const key of ['readReceipt','showOnline','showTyping']) assert.equal(Object.hasOwn(edited,key), false);
  await post({ id: '6f3177a2-9d54-4a62-a62c-4e0acecb06f0', name: 'Edit flags', readReceipt: false, showOnline: false, showTyping: false });
  for (const key of ['readReceipt','showOnline','showTyping']) assert.equal(edited[key], false);
  console.log('PHONE_CREATE_DEFAULTS_OK: read receipt and typing default off, online defaults on, explicit false preserved, edit does not apply create defaults');
})().catch(error => { console.error(error); process.exitCode=1; });
