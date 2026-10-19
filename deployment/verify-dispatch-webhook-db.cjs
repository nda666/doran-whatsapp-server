// Real MySQL transaction, rolled back before any dispatch becomes visible to workers.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
function load(file, stubs) {
  const filename = path.resolve(file), module = { exports: {} }, real = createRequire(filename);
  const code = require('typescript').transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: 1, target: 7, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => Object.hasOwn(stubs, name) ? stubs[name] : real(name), module, module.exports);
  return module.exports;
}
const events = load('src/server/dispatchWebhook/events.ts', { '../../lib/prisma': { prisma: db } });
const id = randomUUID(), rollback = new Error('EXPECTED_ROLLBACK');
(async () => {
  const before = await db.dispatchWebhookSetting.findUniqueOrThrow({ where: { id: 1 } });
  assert.equal(before.enabled, false); assert.equal(before.url, ''); assert.equal(before.secret, '');
  try {
    await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM dispatch_webhook_settings WHERE id = 1 FOR UPDATE`;
      await tx.dispatchWebhookSetting.update({ where: { id: 1 }, data: {
        enabled: true, url: 'https://receiver.invalid/rollback-only', secret: randomUUID(), revision: randomUUID(),
      } });
      const job = { id, phoneId: randomUUID(), userId: randomUUID(), clientJobId: 'rollback-' + id,
        transactionId: id, storeId: 'rollback-only', messageKey: 'default', recipient: '6281111111111',
        dedupeKey: id.padEnd(64, '0'), payloadHash: id.padEnd(64, '1'), message: 'Never committed or sent',
        expiresAt: new Date(Date.now() + 86400000), messageId: 'rollback-' + id };
      await events.createDispatches(tx, { data: [job], skipDuplicates: true });
      await events.createDispatches(tx, { data: [job], skipDuplicates: true });
      assert.equal(await tx.dispatchWebhookEvent.count({ where: { dispatchId: id } }), 1);
      await events.updateDispatches({ where: { id, status: 'QUEUED' }, data: { status: 'PROCESSING', attempts: { increment: 1 } } }, tx);
      const receipts = load('src/server/dispatch/receipts.ts', {
        '../dispatchWebhook/events': { updateDispatches: args => events.updateDispatches(args, tx) },
      });
      for (const level of [2, 3, 4, 3, 4, 2]) await receipts.recordDispatchReceipt(job.phoneId, job.messageId, level);
      const stored = await tx.dispatchWebhookEvent.findMany({ where: { dispatchId: id }, orderBy: { id: 'asc' } });
      assert.deepEqual(stored.map(row => JSON.parse(row.payload).dispatch.status), ['QUEUED', 'PROCESSING', 'SENT', 'DELIVERED', 'READ']);
      assert.deepEqual(stored.map(row => JSON.parse(row.payload).previous_status), [null, 'QUEUED', 'PROCESSING', 'SENT', 'DELIVERED']);
      assert(stored.every(row => JSON.parse(row.payload).dispatch.job_id === job.clientJobId));
      assert.equal((await tx.waDispatch.findUniqueOrThrow({ where: { id } })).status, 'READ');
      throw rollback;
    }, { timeout: 30000 });
  } catch (error) { if (error !== rollback) throw error; }
  assert.equal(await db.waDispatch.count({ where: { id } }), 0);
  assert.equal(await db.dispatchWebhookEvent.count({ where: { dispatchId: id } }), 0);
  assert.deepEqual(await db.dispatchWebhookSetting.findUniqueOrThrow({ where: { id: 1 } }), before);
  console.log('DISPATCH_WEBHOOK_DB_OK_ATOMIC_EVENTS_DEDUPE_RECEIPTS_ROLLBACK_NO_COMMITTED_JOBS');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
