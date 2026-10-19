const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks = {}) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(source, { exports, require: name => { assert(name in mocks, name); return mocks[name]; }, Date, Object, String, Array, Set, Promise });
  return exports;
}
const { dispatchWaitingReason } = load('src/lib/dispatchPresentation.ts');
const now = new Date('2026-10-10T10:00:00Z'), before = new Date(now.getTime() - 1000), later = new Date(now.getTime() + 1000);
const job = { status: 'QUEUED', lastError: null, nextAttemptAt: before }, online = { active: 1, status: 'OPEN' };
assert.match(dispatchWaitingReason(job, online, now), /giliran/);
assert.match(dispatchWaitingReason(job, { active: 0, status: 'OPEN' }, now), /diaktifkan/);
assert.match(dispatchWaitingReason(job, { active: 1, status: null }, now), /terhubung/);
assert.match(dispatchWaitingReason({ ...job, lastError: 'DEVICE_OFFLINE' }, online, now), /terhubung/);
assert.match(dispatchWaitingReason({ ...job, lastError: 'MEDIA_PREPARATION_FAILED', nextAttemptAt: later }, online, now), /lampiran/);
assert.match(dispatchWaitingReason({ ...job, campaign: { status: 'WAITING', scheduledAt: later } }, online, now), /jadwal/);
assert.match(dispatchWaitingReason({ ...job, campaign: { status: 'PAUSED', scheduledAt: before } }, online, now), /dilanjutkan/);
assert.equal(dispatchWaitingReason({ ...job, status: 'SENT' }, online, now), null);
let query, fixture;
const api = load('src/pages/api/dispatch.ts', {
  '@/lib/tableQuery': {}, '@/lib/access': { ownerScope: user => ({ userId: user.id }) },
  '@/middleware/apiAuthMiddleware': { default: handler => handler },
  '@/lib/prisma': { prisma: { waDispatch: { findFirst: async args => { query = args; return fixture; } } } },
  '@/server/dispatch/queue': {}, '@prisma/client': {}, '@/lib/dispatchPresentation': { dispatchWaitingReason },
}).default;
async function request(id) {
  const response = { code: 200, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await api({ method: 'GET', query: { id }, user: { id: 'owner-a' } }, response);
  return response;
}
(async () => {
  fixture = null;
  assert.equal((await request('other-owner-job')).code, 404);
  assert.equal(query.where.userId, 'owner-a');
  assert.equal(query.where.id, 'other-owner-job');
  assert(!query.select.dedupeKey && !query.select.leaseToken && !query.select.userId);
  fixture = { id: 'own-job', message: 'Isi pesan\nBaris kedua', image: null, payload: null, media: null };
  assert.equal((await request('own-job')).body.content_available, true);
  fixture = { ...fixture, message: '' };
  assert.equal((await request('own-job')).body.content_available, false);
  console.log('WAITING_REASONS_OWNER_SCOPED_DETAIL_AND_RETENTION_OK_NO_MESSAGES_SENT');
})().catch(error => { console.error(error); process.exitCode = 1; });
