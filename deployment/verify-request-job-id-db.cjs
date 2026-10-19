// All test writes are rolled back; uncommitted dispatches cannot reach the worker.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
require('@next/env').loadEnvConfig(process.cwd());
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const jobId = 'verify-rollback-' + randomUUID();
const rollback = new Error('EXPECTED_TEST_ROLLBACK');
(async () => {
  const phone = await db.phone.findFirst();
  assert(phone);
  let key;
  try {
    await db.$transaction(async tx => {
      const module = { exports: {} };
      const code = require('typescript').transpileModule(fs.readFileSync('src/server/dispatch/queue.ts', 'utf8'), {
        compilerOptions: { module: 1, target: 7 },
      }).outputText;
      const prisma = { waDispatch: tx.waDispatch, $transaction: fn => fn(tx) };
      new Function('require', 'module', 'exports', code)(name => name === '../../lib/prisma' ? { prisma } : require(name), module, module.exports);
      const queue = module.exports;
      key = queue.requestJobKey(phone.id, jobId);
      const body = { job_id: jobId, number: '6281217357535,6281317357535', message: 'Rollback-only verification' };
      const first = await queue.enqueueDispatch(phone.id, phone.userId, body);
      assert.equal(first.existing, false); assert.equal(first.data.length, 2);
      await tx.waDispatch.updateMany({ where: { requestJobKey: key }, data: { status: 'READ', attempts: 1 } });
      const retry = await queue.enqueueDispatch(phone.id, phone.userId, { job_id: jobId });
      assert.equal(retry.existing, true);
      assert.deepEqual(retry.data.map(job => job.id), first.data.map(job => job.id));
      assert(retry.data.every(job => job.status === 'READ' && job.attempts === 1));
      assert.equal(await queue.existingRequestJob(randomUUID(), { job_id: jobId }), null);
      throw rollback;
    }, { isolationLevel: 'ReadCommitted', timeout: 20000 });
  } catch (error) { if (error !== rollback) throw error; }
  assert.equal(await db.waDispatch.count({ where: { requestJobKey: key } }), 0);
  console.log('REQUEST_JOB_ID_REAL_DB_OK_ALL_TEST_WRITES_ROLLED_BACK');
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => db.$disconnect());
