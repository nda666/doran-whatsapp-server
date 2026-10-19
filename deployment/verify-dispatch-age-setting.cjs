'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const ts = require('typescript');
function load(relative, stubs = {}) {
  const file = path.resolve(__dirname, '..', relative), real = createRequire(file), module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: 1, target: 7, esModuleInterop: true } }).outputText;
  new Function('require', 'module', 'exports', code)(name => Object.hasOwn(stubs, name) ? stubs[name] : real(name), module, module.exports);
  return module.exports;
}
const constants = load('src/lib/dispatchSettings.ts');
const cryptoSettings = load('src/lib/globalSettings.ts');
process.env.SETTINGS_ENCRYPTION_KEY = 'synthetic-test-key';
let stored = null, sends = 0, jobs = [], claims = [];
const DAY = 86400000, now = Date.now();
const prisma = {
  globalSetting: { findUnique: async ({ where }) => where.key === constants.DISPATCH_MAX_AGE_DAYS_KEY ? stored : null },
  campaign: { updateMany: async () => ({ count: 0 }) },
  waSenderLease: { updateMany: async () => ({ count: 1 }), findFirst: async () => ({}) },
  phone: { findUnique: async () => ({ active: 1 }) },
  waDispatch: { findUnique: async ({ where }) => jobs.find(j => j.id === where.id), findFirst: async ({ where }) => jobs.find(job => job.status === 'QUEUED' && job.createdAt > where.createdAt.gt && (!job.campaignId || job.expiresAt > new Date())) || null },
  $transaction: async callback => callback(prisma),
};
const settings = load('src/server/dispatch/settings.ts', { '../../lib/prisma': { prisma }, '../../lib/globalSettings': cryptoSettings, '../../lib/dispatchSettings': constants });
const events = { updateDispatches: async ({ where, data }) => {
  if (data.status === 'PROCESSING') claims.push(where);
  let count = 0;
  for (const job of jobs) {
    if (where.id && where.id !== job.id || job.status !== where.status) continue;
    if (where.createdAt?.lte && job.createdAt > where.createdAt.lte || where.createdAt?.gt && job.createdAt <= where.createdAt.gt) continue;
    if (where.expiresAt?.lte && job.expiresAt > where.expiresAt.lte) continue;
    if (where.campaignId?.not === null && !job.campaignId) continue;
    Object.assign(job, data); count++;
  }
  return { count };
} };
const socket = { ws: { isOpen: true }, user: { id: 'mock' }, waitForMessage: async () => ({ tag: 'ack', attrs: {} }), sendMessage: async () => { sends++; return { key: { id: 'mock-message' } }; } };
const worker = load('src/server/dispatch/worker.ts', {
  '../libs/phoneMaintenance': { phoneMaintenance: new Set() }, './acknowledgement': { waitForDispatchAcknowledgement: (wait, id) => wait(id, 40000) }, './retry': load('src/server/dispatch/retry.ts'), './receipts': { recordDispatchReceipt: async () => {} },
  '../../lib/prisma': { prisma }, '../dispatchWebhook/events': events, './settings': settings,
  '../../lib/dispatchSettings': constants,
  './timing': { delayMinMs: 2000, delayMaxMs: 5000, randomDispatchDelay: () => 2000 },
  '../libs/makeWASocket': { session: new Map([['phone', socket]]) },
  '@whiskeysockets/baileys': { generateMessageIDV2: () => 'mock-message' },
  './media': {}, '../campaigns/media': {}, '../campaigns/content': {},
});
const row = { id: '22222222-2222-4222-8222-222222222222', key: constants.DISPATCH_MAX_AGE_DAYS_KEY, label: constants.DISPATCH_MAX_AGE_LABEL, value: cryptoSettings.encryptSetting('7') };
const api = load('src/pages/api/admin/global-settings.ts', {
  '@/lib/prisma': { prisma: { globalSetting: {
    createMany: async () => ({ count: 0 }), findMany: async () => [row], findUnique: async () => row,
    update: async ({ data }) => Object.assign(row, data),
  } } },
  '@/lib/globalSettings': cryptoSettings, '@/lib/dispatchSettings': constants,
  '@/middleware/apiSuperAdminMiddleware': handler => handler,
}).default;
async function apiRequest(method, value) {
  const res = { code: 200, body: null, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await api({ method, body: { id: row.id, label: row.label, value } }, res);
  return res;
}
const makeJob = (id, age) => ({ id, createdAt: new Date(now - age * DAY), expiresAt: new Date(now - DAY), status: 'QUEUED', campaignId: null, recipient: '6281234567890', message: 'synthetic' });
(async () => {
  for (const value of ['', '0', '-1', '1.5', 'NaN', '3651', '1e2']) assert.equal(constants.parseDispatchMaxAgeDays(value), null);
  assert.equal(constants.parseDispatchMaxAgeDays('7'), 7);
  assert.equal(constants.parseDispatchMaxAgeDays('3650'), 3650);
  assert.equal(constants.dispatchAgeCutoff(7, now).getTime(), now - 7 * DAY);
  const listed = await apiRequest('GET');
  assert.equal(listed.body[0].value, '7'); // Initialization never overwrites a saved value.
  for (const value of ['0', '-1', '1.5', '3651', 'abc']) assert.equal((await apiRequest('PATCH', value)).code, 400);
  assert.equal((await apiRequest('PATCH', '14')).code, 200);
  assert.equal(cryptoSettings.decryptSetting(row.value), '14');
  assert(Math.abs((await settings.getDispatchAgeCutoff()).getTime() - (Date.now() - DAY)) < 100);
  stored = { value: cryptoSettings.encryptSetting('7') };
  jobs = [makeJob('old', 8), makeJob('eligible-with-old-expiry', 3)];
  await worker.recoverDispatches();
  assert.equal(jobs[0].status, 'FAILED');
  assert.equal(jobs[0].lastError, 'QUEUE_MAX_AGE_EXCEEDED');
  assert.equal(jobs[1].status, 'QUEUED');
  await worker.processPhone('phone');
  assert.equal(sends, 1); assert.equal(jobs[1].status, 'SENT');
  assert(claims[0].createdAt.gt instanceof Date);
  jobs = [makeJob('pending', 3)];
  stored = { value: cryptoSettings.encryptSetting('2') };
  await worker.processPhone('phone'); assert.equal(sends, 1);
  await worker.recoverDispatches(); assert.equal(jobs[0].status, 'FAILED');
  stored = { value: cryptoSettings.encryptSetting('7') };
  await worker.processPhone('phone'); assert.equal(sends, 1); // Failed jobs never revive.
  jobs = [{ ...makeJob('campaign', 8), campaignId: 'campaign' }];
  await worker.recoverDispatches(); assert.equal(jobs[0].lastError, 'QUEUE_MAX_AGE_EXCEEDED');
  stored = { value: cryptoSettings.encryptSetting('invalid') };
  await assert.rejects(settings.getDispatchAgeCutoff(), /Invalid dispatch/);
  console.log('PASS: day validation, encrypted settings, dynamic queue cutoff, old API expiry, claim guard, campaign age, no revival');
})().catch(error => { console.error(error); process.exitCode = 1; });
