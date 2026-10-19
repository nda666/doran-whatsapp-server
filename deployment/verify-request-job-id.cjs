const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const rows = [];
let inserts = 0;
let pending = Promise.resolve();
const matches = (row, where) => Object.entries(where).every(([key, value]) =>
  value && typeof value === 'object' && value.in ? value.in.includes(row[key]) : row[key] === value);
const tx = {
  $queryRaw: async () => [],
  dispatchWebhookSetting: {findUnique: async () => null},
  waSenderLease: { createMany: async () => {} },
  waDispatch: {
    findMany: async ({ where }) => rows.filter(row => matches(row, where)).sort((a, b) => a.recipient.localeCompare(b.recipient)),
    count: async ({ where }) => rows.filter(row => matches(row, where)).length,
    createMany: async ({ data }) => {
      inserts++;
      for (const job of data) if (!rows.some(row => row.dedupeKey === job.dedupeKey)) rows.push({ ...job, status: 'QUEUED', attempts: 0 });
    },
  },
};
const prisma = { ...tx, $transaction(fn) {
  const result = pending.then(() => fn(tx));
  pending = result.catch(() => {});
  return result;
} };
const eventCode = ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname, '../src/server/dispatchWebhook/events.ts'), 'utf8'), { compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020} }).outputText;
const events = {exports:{}};
new Function('require','module','exports',eventCode)(name => name === '../../lib/prisma' ? {prisma} : require(name),events,events.exports);
const code = ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname, '../src/server/dispatch/queue.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const loaded = { exports: {} };
new Function('require', 'module', 'exports', code)(name => name === '../../lib/prisma' ? { prisma } : name === '../dispatchWebhook/events' ? events.exports : require(name), loaded, loaded.exports);
const { enqueueDispatch, requestJobId, existingRequestJob, prepareDispatch } = loaded.exports;
(async () => {
  for (const job_id of ['', ' ', null, 123, ['a'], 'x'.repeat(129), 'a\nb']) {
    assert.throws(() => requestJobId({ job_id }), error => error.status === 400);
  }
  const body = { job_id: 'order-1', number: '081217357535,6281217357535', message: 'First message' };
  const first = await enqueueDispatch('phone-1', 'owner', body);
  assert.equal(first.existing, false);
  assert.equal(first.data.length, 1);
  rows[0].status = 'READ'; rows[0].attempts = 1;
  const retry = await enqueueDispatch('phone-1', 'owner', { job_id: 'order-1', number: 'invalid', message: 'changed' });
  assert.equal(retry.existing, true);
  assert.equal(retry.data[0].status, 'READ');
  assert.equal(retry.data[0].id, first.data[0].id);
  assert.equal(retry.transaction_id, first.transaction_id);
  assert.equal(inserts, 1);
  assert.equal(await existingRequestJob('phone-2', { job_id: 'order-1' }), null);
  await enqueueDispatch('phone-2', 'owner', body);
  const concurrent = await Promise.all(Array.from({ length: 8 }, () => enqueueDispatch('phone-1', 'owner', {
    job_id: 'parallel', number: '6281217357535,6281317357535', message: 'Concurrent',
  })));
  assert.equal(concurrent.filter(result => !result.existing).length, 1);
  assert.equal(new Set(concurrent.map(result => result.data.map(job => job.id).join(','))).size, 1);
  assert.equal(rows.length, 4);
  const before = rows.length;
  const legacy = { transaction_id: 'legacy', number: '6281217357535', message: 'Legacy' };
  await enqueueDispatch('phone-1', 'owner', legacy);
  await enqueueDispatch('phone-1', 'owner', legacy);
  assert.equal(rows.length, before + 1);
  await assert.rejects(enqueueDispatch('phone-1', 'owner', { ...legacy, message: 'Different' }), error => error.status === 409);
  assert.notEqual(prepareDispatch('phone-1', 'owner', { number: body.number, message: body.message }).transactionId,
    prepareDispatch('phone-1', 'owner', { number: body.number, message: body.message }).transactionId);
  console.log('PASS: validation, latest status, changed payload, device isolation, concurrent retries, multiple recipients, legacy dedupe');
})().catch(error => { console.error(error); process.exitCode = 1; });
