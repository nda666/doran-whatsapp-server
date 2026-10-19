const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
let calls = [], count = 1;
const stubs = {
  '@/lib/prisma': { prisma: { autoReply: {
    updateMany: async args => { calls.push(args); return { count }; },
    deleteMany: async args => { calls.push(args); return { count }; },
  } } },
  '@/lib/access': { ownerScope: user => user.admin ? {} : { userId: user.id } },
  '@/middleware/apiAuthMiddleware': { __esModule: true, default: handler => handler },
};
const source = ts.transpileModule(fs.readFileSync('src/pages/api/auto_reply/[id].ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const mod = { exports: {} };
new Function('require', 'module', 'exports', source)(name => stubs[name] ?? require(name), mod, mod.exports);
async function request(method, body = {}, query = { id: '42', phone_id: 'phone' }, user = { id: 'owner' }) {
  const res = { code: 200, headers: {}, status(code) { this.code = code; return this; }, setHeader(k, v) { this.headers[k] = v; }, json(data) { this.data = data; return this; }, end() { return this; } };
  await mod.exports.default({ method, body, query, user }, res); return res;
}
(async () => {
  for (const status of ['active', 'inactive']) {
    assert.equal((await request('PATCH', { reply_status: status, keyword: 'overwrite', phoneId: 'other' })).code, 200);
    assert.deepEqual(calls.at(-1), { where: { id: 42, phoneId: 'phone', userId: 'owner' }, data: { reply_status: status } });
  }
  for (const status of ['', null, 'invalid', undefined]) {
    const before = calls.length;
    assert.equal((await request('PATCH', { reply_status: status })).code, 400); assert.equal(calls.length, before);
  }
  for (const query of [{ id: 'no', phone_id: 'phone' }, { id: '-1', phone_id: 'phone' }, { id: '42' }]) assert.equal((await request('PATCH', { reply_status: 'active' }, query)).code, 400);
  count = 0; assert.equal((await request('PATCH', { reply_status: 'active' })).code, 404);
  count = 1;
  await request('PATCH', { reply_status: 'active' }, { id: '42', phone_id: 'phone' }, { id: 'admin', admin: true });
  assert.deepEqual(calls.at(-1).where, { id: 42, phoneId: 'phone' });
  assert.equal((await request('DELETE')).code, 200);
  assert.equal((await request('POST')).code, 405);
  console.log('AUTO_REPLY_STATUS_OK: activate/deactivate, owner/device scope, status-only writes, validation, missing row, admin, DELETE compatibility');
})().catch(error => { console.error(error); process.exitCode = 1; });
