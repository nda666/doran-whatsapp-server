const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { createHash } = require('node:crypto');
const key = (phoneId, jobId) => createHash('sha256').update(JSON.stringify([phoneId, jobId])).digest('hex');
let captured, responseBody, phoneQueries = 0;
class DispatchError extends Error { constructor(status, message) { super(message); this.status = status; } }
const prisma = {
  phone: { findMany: async ({ where }) => { phoneQueries++; assert.equal(where.userId, 'owner'); return [{ id: where.id || 'device' }]; } },
  waDispatch: {
    count: async ({ where }) => { captured = where; return 0; },
    findMany: async () => [
      { id: 'internal-with-client', clientJobId: 'ORDER-001', storeId: 'JETE Surabaya' },
      { id: 'internal-legacy', clientJobId: null, storeId: 'default' },
    ], groupBy: async () => [],
  },
};
const stubs = {
  '@/lib/tableQuery': { tableQuery: () => ({ page: 1, limit: 5, skip: 0, orderBy: { createdAt: 'desc' } }) },
  '@/lib/access': { ownerScope: () => ({ userId: 'owner' }) },
  '@/middleware/apiAuthMiddleware': { __esModule: true, default: handler => handler },
  '@/lib/prisma': { prisma },
  '@/server/dispatch/queue': { dispatchSummary: x => x, requestJobKey: key, DispatchError,
    requestJobId: ({ job_id }) => { if (typeof job_id !== 'string' || !job_id.trim() || job_id.length > 128 || /[\x00-\x1f]/.test(job_id)) throw new DispatchError(400, 'Invalid job_id'); return job_id.trim(); } },
  '@prisma/client': { WaDispatchStatus: { SENT: 'SENT' } },
  '@/lib/dispatchPresentation': { dispatchWaitingReason: () => '' },
};
const moduleCopy = { exports: {} };
const code = ts.transpileModule(fs.readFileSync('src/pages/api/dispatch.ts', 'utf8'), { compilerOptions: { module: 1, target: 7, esModuleInterop: true } }).outputText;
new Function('require', 'module', 'exports', code)(name => { assert(name in stubs, name); return stubs[name]; }, moduleCopy, moduleCopy.exports);
async function run(query) {
  let status = 200;
  const response = { setHeader() {}, status(value) { status = value; return this; }, json(body) { responseBody = body; }, end() {} };
  await moduleCopy.exports.default({ method: 'GET', query, user: { id: 'owner' } }, response);
  return status;
}
(async () => {
  assert.equal(await run({ job_id: ' ORDER-001 ', status: 'SENT', phone_id: 'device', store_id: 'store', transaction_id: 'tx', source: 'API' }), 200);
  assert.deepEqual(captured, { userId: 'owner', status: 'SENT', OR: [{ id: 'ORDER-001' }, { requestJobKey: { in: [key('device', 'ORDER-001')] } }], phoneId: 'device', source: 'API', transactionId: 'tx', storeId: 'store' });
  await run({ job_id: 'internal-uuid' }); assert.equal(captured.OR[0].id, 'internal-uuid'); assert.equal(captured.userId, 'owner');
  await run({ job_id: '' }); assert.equal(captured.OR, undefined);
  await run({}); assert.equal(captured.OR, undefined);
  assert.equal(responseBody.data[0].job_id, 'ORDER-001');
  assert.equal(responseBody.data[0].store_id, 'JETE Surabaya');
  assert.equal(responseBody.data[0].id, 'internal-with-client');
  assert.equal(responseBody.data[1].id, 'internal-legacy');
  assert.equal(responseBody.data[1].job_id, null);
  assert.equal(responseBody.data[1].store_id, 'default');
  for (const job_id of [[], ' ', 'x'.repeat(129), 'bad\nvalue']) assert.equal(await run({ job_id }), 400);
  assert(phoneQueries > 0);
  console.log('DISPATCH_JOB_SEARCH_OK_EXACT_ID_HASH_FILTER_COMPOSITION_OWNER_SCOPE_VALIDATION');
})().catch(error => { console.error(error); process.exitCode = 1; });
