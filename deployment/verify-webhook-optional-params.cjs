const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
let saved, writes = 0;
const allowed = ['Sender', 'Recipient', 'Message', 'Quote', 'Custom'];
const write = async ({ data }) => {
  for (let i = 1; i <= 3; i++) {
    const value = data['isi_param_' + i];
    assert(value === null || allowed.includes(value), 'Prisma rejects empty/invalid ParamType');
  }
  saved = data; writes++; return { id: 123, ...data };
};
const prisma = {
  phone: { findFirst: async () => ({ id: 'phone', userId: 'owner' }) },
  autoReply: { findFirst: async () => ({ id: 123, userId: 'owner' }), create: write, update: write },
};
const stubs = {
  '@/lib/access': { ownerScope: () => ({ userId: 'owner' }) },
  'next-auth/jwt': { getToken: async () => null },
  '@/lib/prisma': { prisma },
  '@/middleware/apiAuthMiddleware': { __esModule: true, default: handler => handler },
  '@/server/campaigns/content': { publicPayload: { parse: value => value } },
};
const source = ts.transpileModule(fs.readFileSync('src/pages/api/auto_reply/index.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;
const mod = { exports: {} };
new Function('require', 'module', 'exports', source)(name => stubs[name] ?? require(name), mod, mod.exports);
const base = { phoneId: 'phone', type_message: 'webhook', type_keyword: 'Equal', keyword: 'test', url: 'https://example.com/webhook', type_request: 'POST' };
async function post(body) {
  const res = { code: 200, status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
  await mod.exports.default({ method: 'POST', user: { id: 'owner' }, body: { ...base, ...body } }, res);
  return res;
}
(async () => {
  for (const id of [undefined, 123]) {
    for (const empty of ['', undefined, null]) {
      assert.equal((await post({ id, isi_param_1: empty, isi_param_2: empty, isi_param_3: empty })).code, 200);
      for (let i = 1; i <= 3; i++) assert.equal(saved['isi_param_' + i], null);
    }
    for (const type of allowed) {
      await post({ id, isi_param_1: type, isi_param_2: type, isi_param_3: '', custom_input_1: 'manual' });
      assert.equal(saved.isi_param_1, type); assert.equal(saved.custom_value_1, 'manual');
      assert.equal(saved.isi_param_3, null);
    }
    for (let i = 1; i <= 3; i++) {
      const before = writes;
      assert.equal((await post({ id, ['isi_param_' + i]: 'invalid' })).code, 400);
      assert.equal(writes, before);
    }
  }
  console.log('WEBHOOK_OPTIONAL_PARAMS_OK: create/edit, empty/omitted/null, all ParamTypes, manual values, invalid returns 400');
})().catch(error => { console.error(error); process.exitCode = 1; });
