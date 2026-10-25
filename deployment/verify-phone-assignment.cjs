const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
require('@next/env').loadEnvConfig(root, true);
const databaseUrl = new URL(process.env.DATABASE_URL);
const expectedDatabase = process.env.CI === 'true' ? '/doran_ci' : '/wa_local';
if (!['localhost', '127.0.0.1'].includes(databaseUrl.hostname) || databaseUrl.pathname !== expectedDatabase) throw new Error('Tests require the isolated CI database or local wa_local database');
const compiler = require('ts-node').register({ project: path.join(root, 'tsconfig.server.json'), transpileOnly: true });
require('tsconfig-paths').register({ baseUrl: root, paths: compiler.config.options.paths });
const dbModule = require('../src/lib/prisma');
const db = dbModule.prisma;
const access = require('../src/lib/access');
const auth = require('../src/middleware/apiAuthMiddleware').default;
const assignment = require('../src/pages/api/phones/[id]/assign').default;
const conversations = require('../src/pages/api/conversations/index').default;
const adminOnly = require('../src/middleware/apiSuperAdminMiddleware').default;
const rollback = new Error('ROLLBACK_ASSIGNMENT_TEST');
let checks = 0;
async function call(handler, token, method = 'GET', query = {}, body = {}) {
  const req = { method, query, body, headers: token ? { authorization: `Bearer ${token}` } : {} };
  const res = { statusCode: 200, headersSent: false, setHeader() {}, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; this.headersSent = true; return this; }, end() { this.headersSent = true; return this; } };
  await handler(req, res);
  return res;
}
async function main() {
  try {
    await db.$transaction(async tx => {
      const makeUser = suffix => tx.user.create({ data: { name: `Assignment test ${suffix}`, email: `${randomUUID()}@assignment.invalid`, password: 'unused-test-password-hash', token: randomUUID(), deviceLimit: 10 } });
      const owner = await makeUser('owner'), user = await makeUser('assigned'), stranger = await makeUser('stranger');
      const phone = await tx.phone.create({ data: { name: 'Assignment test phone', number: '62800000000001', userId: owner.id } });
      const other = await tx.phone.create({ data: { name: 'Unrelated test phone', number: phone.number, userId: stranger.id } });
      await tx.chatConversation.create({ data: { phoneId: phone.id, userId: owner.id, jid: '6281111111111@s.whatsapp.net', name: 'Assigned conversation' } });
      await tx.inboxMessage.createMany({ data: [{ userId: owner.id, recipient: phone.number, sender: 'customer', message: 'visible' }, { userId: stranger.id, recipient: phone.number, sender: 'customer', message: 'private' }] });
      for (const p of [phone, other]) await tx.waDispatch.create({ data: { userId: p.userId, phoneId: p.id, storeId: 'assignment-test', transactionId: randomUUID(), messageKey: 'test', recipient: '6281111111111', dedupeKey: randomUUID().replaceAll('-', '').padEnd(64, '0'), payloadHash: '0'.repeat(64), message: 'test', expiresAt: new Date(Date.now() + 60000) } });
      const admin = { ...owner, id: randomUUID(), email: access.SUPER_ADMIN_EMAIL, role: 'ADMIN', token: randomUUID() };
      // All route queries use this transaction, including nested assignment saves.
      // Fixtures and every assignment are rolled back together on completion.
      dbModule.prisma = new Proxy(tx, { get(target, key) {
        if (key === '$transaction') return callback => callback(tx);
        if (key === 'user') return new Proxy(tx.user, { get(model, method) {
          if (method === 'findFirst') return args => args.where?.token === admin.token ? Promise.resolve(admin) : tx.user.findFirst(args);
          return model[method];
        } });
        return target[key];
      } });
      const context = auth(async (req, res) => res.json(req.user));
      assert.equal((await call(context)).statusCode, 401); checks++;
      const getActor = async account => (await call(context, account.token)).body;
      let actor = await getActor(user);
      assert.equal(await tx.phone.count({ where: access.phoneScope(actor) }), 0); checks++;
      assert.equal((await call(assignment, user.token, 'POST', { id: phone.id }, { userId: user.id, expectedAssignedUserId: null })).statusCode, 403); checks++;
      const response = await call(assignment, admin.token, 'POST', { id: phone.id }, { userId: user.id, expectedAssignedUserId: null });
      assert.equal(response.statusCode, 200, JSON.stringify(response.body)); checks++;
      actor = await getActor(user);
      assert.deepEqual((await tx.phone.findMany({ where: access.phoneScope(actor), select: { id: true } })).map(p => p.id), [phone.id]); checks++;
      assert.equal(await tx.phone.count({ where: { ...access.phoneScope(actor), id: other.id } }), 0); checks++;
      assert.equal(await tx.waDispatch.count({ where: access.phoneRecordScope(actor) }), 1); checks++;
      assert.equal(await tx.waDispatch.count({ where: { ...access.phoneRecordScope(actor), phoneId: other.id } }), 0); checks++;
      assert.equal(await tx.waDispatch.count({ where: access.phoneRecordScope(await getActor(stranger)) }), 1); checks++;
      assert.equal(await tx.waDispatch.count({ where: access.phoneRecordScope({ ...user, accessiblePhoneIds: [] }) }), 0); checks++;
      assert.equal(await tx.phone.count({ where: access.phoneScope(await getActor(owner)) }), 0); checks++;
      assert.equal((await tx.phone.findUnique({ where: { id: phone.id } })).token, phone.token); checks++;
      const inbox = await tx.inboxMessage.findMany({ where: access.inboxScope(actor) });
      assert.deepEqual(inbox.map(row => row.message), ['visible']); checks++;
      assert.equal((await call(conversations, user.token, 'GET', { phone_id: phone.id })).body.total, 1); checks++;
      assert.equal((await call(conversations, user.token, 'GET', { phone_id: other.id })).statusCode, 404); checks++;
      assert.equal((await call(adminOnly((_req, res) => res.json({ ok: true })), user.token)).statusCode, 403); checks++;
      for (const page of ['/dashboard/ai-plugins', '/dashboard/admin', '/dashboard/plans', '/dashboard/sender-groups']) { assert.equal(access.isSuperAdminPage(page), true); checks++; }
      assert.equal((await call(assignment, admin.token, 'POST', { id: phone.id }, { userId: stranger.id, expectedAssignedUserId: null })).statusCode, 409); checks++;
      assert.equal((await call(assignment, admin.token, 'POST', { id: phone.id }, { userId: null, expectedAssignedUserId: user.id })).statusCode, 200); checks++;
      assert.equal(await tx.phone.count({ where: access.phoneScope(await getActor(user)) }), 0); checks++;
      assert.equal(await tx.phone.count({ where: access.phoneScope(await getActor(owner)) }), 1); checks++;
      assert.equal(await tx.phone.count({ where: access.phoneScope({ ...user, accessiblePhoneIds: undefined }) }), 0); checks++;
      throw rollback;
    }, { timeout: 30000 });
  } catch (error) { if (error !== rollback) throw error; }
  finally { dbModule.prisma = db; await db.$disconnect(); }
  console.log(`PASS: ${checks} assignment/access checks; all test fixtures rolled back.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
