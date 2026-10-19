// Exercise the actual API handler with an isolated database stub; no live data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/pages/api/contacts/sync.ts'), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const plain = value => JSON.parse(JSON.stringify(value));

async function run({ rows = [], added = 0, groupId = null, phone = { userId: 'owner' }, group = { id: 'group' }, method = 'POST' } = {}) {
  const writes = [];
  let reads = 0;
  const prisma = {
    phone: { findFirst: async ({ where }) => { assert.deepEqual(plain(where), { id: 'device', userId: 'owner' }); return phone; } },
    contactGroup: { findFirst: async ({ where }) => { assert.deepEqual(plain(where), { id: groupId, userId: 'owner' }); return group; } },
    deviceContact: { findMany: async ({ where, take }) => { reads++; assert.deepEqual(plain(where), { phoneId: 'device', userId: 'owner' }); assert.equal(take, 10000); return rows; } },
    contact: { createMany: async (payload) => { assert.equal(payload.skipDuplicates, true); writes.push(payload.data); return { count: added }; } },
  };
  const context = {
    exports: {},
    require: (id) => {
      if (id === '@/lib/access') return { ownerScope: () => ({ userId: 'owner' }) };
      if (id === '@/lib/prisma') return { prisma };
      if (id === '@/middleware/apiAuthMiddleware') return { default: handler => handler };
      throw new Error(`Unexpected import: ${id}`);
    },
  };
  vm.runInNewContext(code, context);
  const res = { statusCode: 200, body: undefined, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, end() { return this; } };
  await context.exports.default({ method, body: { phoneId: 'device', groupId }, user: { id: 'owner' } }, res);
  return { status: res.statusCode, body: res.body, writes, reads };
}

(async () => {
  const rows = [{ name: 'One', number: '6281234567890' }, { name: 'Two', number: '6281234567891' }];
  const result = await run({ rows, added: 1, groupId: 'group' });
  assert.deepEqual(JSON.parse(JSON.stringify(result.body)), { found: 2, count: 1, skipped: 1 });
  assert.deepEqual(JSON.parse(JSON.stringify(result.writes[0])), rows.map(row => ({ userId: 'owner', ...row, groupId: 'group' })));
  const duplicates = await run({ rows, added: 0 });
  assert.equal(duplicates.body.found, 2);
  assert.equal(duplicates.body.count, 0);
  assert.equal(duplicates.body.skipped, 2);
  assert.equal(duplicates.writes[0][0].groupId, null);
  const empty = await run();
  assert.equal(empty.status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(empty.body)), { found: 0, count: 0, skipped: 0 });
  assert.equal(empty.writes.length, 0);
  for (const input of [{ phone: null }, { groupId: 'group', group: null }, { method: 'GET' }]) {
    const denied = await run(input);
    assert.equal(denied.status, input.method ? 405 : 404);
    assert.equal(denied.reads, 0);
    assert.equal(denied.writes.length, 0);
  }
  console.log('Contact sync passed: result counts, duplicate handling, zero contacts, group assignment and access checks.');
})().catch(error => { console.error(error); process.exitCode = 1; });
