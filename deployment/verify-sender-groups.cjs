'use strict';
// Real MySQL, mock WhatsApp transport. Never uses DATABASE_URL or real sockets.
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const { randomUUID } = require('node:crypto');
const ts = require('typescript');
const { PrismaClient } = require('@prisma/client');
const root = path.resolve(__dirname, '..');
const baselineRevision = 'f46d93a7e0e71e9f58f246f76f997455080fce39';
const url = process.env.SENDER_GROUP_TEST_DATABASE_URL;
if (!url) throw new Error('Set SENDER_GROUP_TEST_DATABASE_URL to a disposable local MySQL database.');
const target = new URL(url);
assert(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname));
assert(/^\/jeblast_sender_groups_test_[a-z0-9_]+$/.test(target.pathname), 'Only a disposable test database is allowed');
const prisma = new PrismaClient({ datasources: { db: { url } } });
const sockets = new Map(), sends = [], modes = new Map(), heldAcks = new Map();
const cache = {};
const stubs = {
  'src/lib/prisma.ts': { prisma },
  'src/server/libs/makeWASocket.ts': { session: sockets },
  'src/server/libs/sendMessageFromIo.ts': { __esModule: true, default: () => { throw new Error('Real transport prohibited'); } },
  'src/middleware/apiAuthMiddleware.ts': { __esModule: true, default: fn => fn },
};
function load(name) {
  if (stubs[name]) return stubs[name];
  if (cache[name]) return cache[name].exports;
  const module = { exports: {} }; cache[name] = module;
  const code = ts.transpileModule(fs.readFileSync(path.join(root, name), 'utf8'), {
    compilerOptions: { module: 1, target: 7, esModuleInterop: true },
  }).outputText;
  const req = spec => {
    if (spec === '@whiskeysockets/baileys') return { generateMessageIDV2: () => randomUUID() };
    if (spec.startsWith('@/')) return load('src/' + spec.slice(2) + '.ts');
    if (spec.startsWith('.')) return load(path.posix.normalize(path.posix.join(path.posix.dirname(name), spec)) + '.ts');
    return require(spec);
  };
  new Function('require', 'module', 'exports', code)(req, module, module.exports);
  return module.exports;
}
function mockSocket(phone) {
  const socket = { ws: { isOpen: true }, user: { id: phone.id }, sendPresenceUpdate: async () => {},
    waitForMessage: id => new Promise(resolve => heldAcks.set(id, resolve)),
    sendMessage: async (jid, content, options) => {
      await load('src/server/messaging/safety.ts').reserveSend(phone.userId, phone.id, jid);
      sends.push({ phoneId: phone.id, messageId: options.messageId });
      const mode = modes.get(phone.id) || 'ack';
      if (mode === 'error') throw new Error('MOCK_SOCKET_CLOSED');
      if (mode !== 'hold') heldAcks.get(options.messageId)({ tag: 'ack', attrs: mode === 'restricted' ? { error: '463' } : {} });
      return { key: { id: options.messageId } };
    },
  };
  sockets.set(phone.id, socket); return socket;
}
async function api(handler, req) {
  const response = { code: 200, body: undefined, setHeader() {}, status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; }, end() { return this; } };
  await handler({ method: 'GET', headers: {}, query: {}, ...req }, response);
  return response;
}
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitUntil(predicate) {
  for (let n = 0; n < 200; n++) { if (await predicate()) return; await sleep(10); }
  throw new Error('Timed out waiting for mock transport');
}
async function main() {
  // Bootstrap the previous schema, then execute the actual incremental migration.
  // Refuse an existing database so this test cannot alter an existing workspace DB.
  const adminUrl = new URL(url); adminUrl.pathname = '/mysql';
  const bootstrapAdmin = new PrismaClient({ datasources: { db: { url: adminUrl.href } } });
  try {
    const existing = await bootstrapAdmin.$queryRaw`SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ${target.pathname.slice(1)}`;
    assert.equal(existing.length, 0, 'Test database must not exist');
    await bootstrapAdmin.$executeRawUnsafe(`CREATE DATABASE \`${target.pathname.slice(1)}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally { await bootstrapAdmin.$disconnect(); }
  const baseline = path.join(root, 'tmp', `sender-groups-baseline-${process.pid}.prisma`);
  fs.mkdirSync(path.dirname(baseline), { recursive: true });
  fs.writeFileSync(baseline, cp.execFileSync('git', ['show', `${baselineRevision}:prisma/schema.prisma`], { cwd: root }));
  const baselineSql = cp.execFileSync(process.execPath, [path.join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', baseline, '--script'], {
    cwd: root, env: { ...process.env, DATABASE_URL: url,
      ...(process.platform === 'win32' ? { PRISMA_QUERY_ENGINE_LIBRARY: path.join(root, 'node_modules/@prisma/engines/query_engine-windows.dll.node') } : {}) }, stdio: 'pipe',
  }).toString();
  // Prisma's datamodel does not express collation. The historical dispatch
  // migration uses utf8mb4_bin for this primary key; preserve that FK contract.
  const legacyBaselineSql = baselineSql.replace(/(CREATE TABLE `wa_dispatches` \(\s*`id` VARCHAR\(36\)) NOT NULL/, '$1 CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL');
  assert.notEqual(legacyBaselineSql, baselineSql, 'Legacy dispatch primary-key collation fixture must be applied');
  for (const statement of legacyBaselineSql.split(';').map(s => s.trim()).filter(Boolean)) await prisma.$executeRawUnsafe(statement);
  const schemaUpgrade = require('./cd-feature-schema.cjs');
  // Validate the actual Prisma diff syntax used by the production preflight,
  // including separate CREATE INDEX and ADD CONSTRAINT statements.
  const approvedSql = cp.execFileSync(process.execPath, [path.join(root, 'node_modules/prisma/build/index.js'),
    'migrate', 'diff', '--from-schema-datamodel', baseline, '--to-schema-datamodel', path.join(root, 'prisma/schema.prisma'), '--script'],
    { cwd: root, env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' }).toString();
  const testBackup = path.join(root, 'tmp', `schema-upgrade-backup-${process.pid}`);
  fs.mkdirSync(testBackup);
  await assert.rejects(schemaUpgrade.apply(prisma, approvedSql, testBackup), 'Missing backups must prohibit schema writes');
  fs.writeFileSync(path.join(testBackup, 'database.sql'), legacyBaselineSql);
  fs.writeFileSync(path.join(testBackup, 'storage-and-env.tar'), Buffer.alloc(1024));
  const upgrade = await schemaUpgrade.apply(prisma, approvedSql, testBackup);
  assert.deepEqual(upgrade.created_tables.sort(), ['sender_groups', 'wa_dispatch_attempts']);
  assert.equal(upgrade.history_updated, false);
  assert.equal((await schemaUpgrade.apply(prisma, approvedSql, testBackup)).executed.length, 0, 'Schema preparation must be idempotent');
  console.log('PASS incremental MySQL upgrade, backup requirement, idempotency and unchanged migration history');

  const user = await prisma.user.create({ data: { email: 'sender-test@example.test', password: 'unused', token: randomUUID() } });
  const foreign = await prisma.user.create({ data: { email: 'other-test@example.test', password: 'unused', token: randomUUID() } });
  const primary = await prisma.phone.create({ data: { userId: user.id, name: 'A1', active: 0 } });
  const backup = await prisma.phone.create({ data: { userId: user.id, name: 'A2' } });
  const third = await prisma.phone.create({ data: { userId: user.id, name: 'A3' } });
  const other = await prisma.phone.create({ data: { userId: foreign.id, name: 'B1' } });
  await prisma.deviceSendPolicy.createMany({ data: [primary, backup, third, other].map(phone => ({ phoneId: phone.id, nextAllowedAt: new Date(0) })) });
  const admin = { id: user.id, role: 'ADMIN', email: 'admin@gmail.com', approvalStatus: 'APPROVED', isActive: true };
  const groupApi = load('src/pages/api/sender-groups.ts').default;
  const groupInput = { userId: user.id, name: 'Store A', enabled: true, phoneIds: [primary.id, backup.id, third.id] };
  let response = await api(groupApi, { method: 'POST', user: { ...user, role: 'USER' }, body: groupInput });
  assert.equal(response.code, 403, 'Only super admin manages sender groups');
  response = await api(groupApi, { method: 'POST', user: admin, body: { ...groupInput, phoneIds: [primary.id, other.id] } });
  assert.equal(response.code, 400, 'Cross-owner groups prohibited');
  response = await api(groupApi, { method: 'POST', user: admin, body: groupInput });
  assert.equal(response.code, 200);
  const group = await prisma.senderGroup.findFirstOrThrow({ where: { name: 'Store A' } });
  response = await api(groupApi, { user: admin });
  assert(!JSON.stringify(response.body).includes(primary.token), 'Group management must not expose API tokens');
  response = await api(groupApi, { method: 'POST', user: admin, body: { ...groupInput, name: 'Other', phoneIds: [backup.id] } });
  assert.equal(response.code, 409, 'A phone cannot belong to two groups');
  console.log('PASS group administration, owner isolation, unique membership');

  await prisma.dispatchWebhookSetting.create({ data: { id: 1, enabled: true, url: 'https://cashier.example.test/webhook', secret: 'test-only', revision: randomUUID() } });
  const queue = load('src/server/dispatch/queue.ts');
  const worker = load('src/server/dispatch/worker.ts');
  const receipts = load('src/server/dispatch/receipts.ts');
  const sendApi = load('src/pages/api/send-message.ts').default;
  const statusApi = load('src/pages/api/send-status.ts').default;
  process.env.DISPATCH_QUEUE_ENABLED = 'true';
  const body = { api_key: primary.token, store_id: 'STORE-A', transaction_id: 'TX-001', job_id: 'JOB-001', number: '6281234567890', message: 'Test only' };
  response = await api(sendApi, { method: 'POST', body });
  assert.equal(response.code, 200); assert.equal(response.body.result, true, 'Inactive origin accepts requests for enabled group');
  const dispatchId = response.body.data[0].id;
  await prisma.waDispatch.update({ where: { id: dispatchId }, data: { nextAttemptAt: new Date(0) } });
  await prisma.waSenderLease.updateMany({ data: { nextSendAt: new Date(0) } });
  mockSocket(backup); mockSocket(third);
  await worker.processPhone(primary.id);
  let job = await prisma.waDispatch.findUniqueOrThrow({ where: { id: dispatchId } });
  assert.equal(job.status, 'SENT'); assert.equal(job.phoneId, primary.id); assert.equal(job.senderPhoneId, backup.id);
  assert.equal(job.storeId, 'STORE-A'); assert.equal(job.transactionId, 'TX-001');
  assert.equal((await prisma.deviceDailyUsage.findUniqueOrThrow({ where: { phoneId_day: { phoneId: backup.id, day: load('src/server/messaging/safety.ts').usageDay() } } })).attempts, 1);
  response = await api(sendApi, { method: 'POST', body });
  assert.equal(response.body.data[0].id, dispatchId); assert.equal(response.body.existing, true);
  response = await api(statusApi, { method: 'POST', body: { api_key: primary.token, id: dispatchId } });
  assert.equal(response.body.total, 1); assert.equal(response.body.data[0].sender_device_id, backup.id);
  response = await api(statusApi, { method: 'POST', body: { api_key: backup.token, id: dispatchId } });
  assert.equal(response.body.total, 0, 'Backup token cannot read another token origin');
  response = await api(statusApi, { method: 'POST', body: { api_key: other.token, id: dispatchId } });
  assert.equal(response.body.total, 0);
  await receipts.recordDispatchReceipt(primary.id, job.messageId, 4);
  assert.equal((await prisma.waDispatch.findUniqueOrThrow({ where: { id: dispatchId } })).status, 'SENT', 'Wrong device receipt ignored');
  await receipts.recordDispatchReceipt(backup.id, job.messageId, 3);
  await receipts.recordDispatchReceipt(backup.id, job.messageId, 4);
  const events = await prisma.dispatchWebhookEvent.findMany({ where: { dispatchId }, orderBy: { id: 'asc' } });
  const snapshots = events.map(event => JSON.parse(event.payload).dispatch);
  assert.deepEqual(snapshots.map(s => s.status), ['QUEUED', 'PROCESSING', 'SENT', 'DELIVERED', 'READ']);
  assert(snapshots.every(s => s.id === dispatchId && s.device_id === primary.id));
  assert.equal(snapshots.at(-1).sender_device_id, backup.id);
  assert.equal(snapshots.at(-1).sender_group_id, group.id);
  assert.equal(await prisma.waDispatch.count(), 1, 'Retries did not duplicate the dispatch');
  assert.equal(await prisma.waDispatchAttempt.count({ where: { dispatchId, phoneId: backup.id, status: 'READ' } }), 1);
  console.log('PASS unchanged token/ID, fallback transport, real quota reservation, retry deduplication, scoped status, receipt routing and webhook outbox');

  async function fresh(name) {
    await prisma.waSenderLease.updateMany({ data: { nextSendAt: new Date(0), leaseToken: null, leaseUntil: null } });
    await prisma.deviceSendPolicy.updateMany({ data: { nextAllowedAt: new Date(0) } });
    const result = await queue.enqueueDispatch(primary.id, user.id, { ...body, job_id: name, transaction_id: name });
    await prisma.waDispatch.update({ where: { id: result.data[0].id }, data: { nextAttemptAt: new Date(0) } });
    return result.data[0].id;
  }
  async function due(id) {
    await prisma.waDispatch.update({ where: { id }, data: { nextAttemptAt: new Date(0) } });
    await prisma.waSenderLease.updateMany({ data: { nextSendAt: new Date(0) } });
    await prisma.deviceSendPolicy.updateMany({ data: { nextAllowedAt: new Date(0) } });
  }
  let id = await fresh('QUOTA');
  await prisma.deviceSendPolicy.update({ where: { phoneId: backup.id }, data: { dailyLimit: 1, useGlobalQuota: false } });
  await worker.processPhone(primary.id);
  job = await prisma.waDispatch.findUniqueOrThrow({ where: { id } });
  assert.equal(job.senderPhoneId, third.id, JSON.stringify({ status: job.status, error: job.lastError, attempts: job.attempts, due: job.nextAttemptAt, now: new Date() })); assert.equal(job.status, 'SENT');
  console.log('PASS exhausted primary fallback quota selects the next healthy member');

  id = await fresh('HEALTH');
  await prisma.deviceSendPolicy.update({ where: { phoneId: backup.id }, data: { useGlobalQuota: true } });
  await prisma.deviceDailyUsage.update({ where: { phoneId_day: { phoneId: backup.id, day: load('src/server/messaging/safety.ts').usageDay() } }, data: { attempts: 20, failures: 6 } });
  await worker.processPhone(primary.id);
  job = await prisma.waDispatch.findUniqueOrThrow({ where: { id } });
  assert.equal(job.senderPhoneId, third.id); assert.equal(job.status, 'SENT');
  await prisma.deviceDailyUsage.update({ where: { phoneId_day: { phoneId: backup.id, day: load('src/server/messaging/safety.ts').usageDay() } }, data: { attempts: 1, failures: 0 } });
  await prisma.deviceSendPolicy.update({ where: { phoneId: backup.id }, data: { dailyLimit: 1, useGlobalQuota: false } });
  console.log('PASS adaptive health protection excludes unhealthy group members');

  id = await fresh('UNAVAILABLE');
  await prisma.deviceSendPolicy.update({ where: { phoneId: third.id }, data: { paused: true } });
  const count = sends.length;
  await worker.processPhone(primary.id);
  job = await prisma.waDispatch.findUniqueOrThrow({ where: { id } });
  assert.equal(job.status, 'QUEUED'); assert.equal(job.attempts, 0); assert.equal(job.lastError, 'SENDER_GROUP_UNAVAILABLE'); assert.equal(sends.length, count);
  // Complete this fixture so it does not block later FIFO cases.
  await prisma.waDispatch.update({ where: { id }, data: { status: 'FAILED' } });
  console.log('PASS all unavailable waits without consuming attempts');

  id = await fresh('RESTRICTED');
  await prisma.deviceSendPolicy.updateMany({ data: { paused: false, useGlobalQuota: true } });
  modes.set(backup.id, 'restricted');
  await worker.processPhone(primary.id);
  job = await prisma.waDispatch.findUniqueOrThrow({ where: { id } });
  assert.equal(job.status, 'QUEUED'); assert.equal(job.messageId, null);
  assert.equal((await prisma.deviceSendPolicy.findUniqueOrThrow({ where: { phoneId: backup.id } })).paused, true);
  await due(id); await worker.processPhone(primary.id);
  job = await prisma.waDispatch.findUniqueOrThrow({ where: { id } });
  assert.equal(job.status, 'SENT'); assert.equal(job.senderPhoneId, third.id);
  const history = await prisma.waDispatchAttempt.findMany({ where: { dispatchId: id }, orderBy: { startedAt: 'asc' } });
  assert.equal(history.length, 2); assert.equal(history[0].error, 'WA_ACK_463_ACCOUNT_RESTRICTED');
  assert.notEqual(history[0].messageId, history[1].messageId);
  console.log('PASS explicit 463 rejection pauses rejected sender and safely uses backup with one dispatch ID');

  id = await fresh('PINNED');
  modes.set(third.id, 'hold');
  const running = worker.processPhone(primary.id);
  await waitUntil(async () => { const current = await prisma.waDispatch.findUniqueOrThrow({ where: { id } }); return sends.some(send => send.messageId === current.messageId && send.phoneId === third.id); });
  const pinned = await prisma.waDispatch.findUniqueOrThrow({ where: { id } });
  await load('src/server/dispatchWebhook/events.ts').updateDispatches({ where: { id }, data: { status: 'QUEUED', lastError: 'ACK_TIMEOUT_RETRY', leaseToken: null, leaseUntil: null } });
  // Simulate an offline sender after a timeout; another healthy member must not take over.
  sockets.get(third.id).ws.isOpen = false;
  await prisma.deviceSendPolicy.update({ where: { phoneId: backup.id }, data: { paused: false } });
  const origin = await prisma.phone.findUniqueOrThrow({ where: { id: primary.id } });
  const route = await load('src/server/dispatch/senderRouting.ts').selectDispatchSender(origin, await prisma.waDispatch.findUniqueOrThrow({ where: { id } }), 'test-pinned', 120000);
  assert.equal(route.phone, null, 'No fallback for missing confirmation');
  // Late ACK still matches actual sender and dispatch ID after a timeout.
  heldAcks.get(pinned.messageId)({ tag: 'ack', attrs: {} }); await running;
  assert.equal((await prisma.waDispatch.findUniqueOrThrow({ where: { id } })).status, 'SENT');
  console.log('PASS ambiguous ACK pins sender and late ACK updates original ID');

  id = await fresh('PINNED-OFFLINE');
  await prisma.waDispatch.update({ where: { id }, data: { messageId: randomUUID(), senderPhoneId: third.id,
    lastError: 'ACK_TIMEOUT_RETRY', attempts: 1, createdAt: new Date(Date.now() - 60000) } });
  const newerId = await fresh('NEWER-UNSENT');
  await worker.processPhone(primary.id);
  assert.equal((await prisma.waDispatch.findUniqueOrThrow({ where: { id } })).status, 'QUEUED');
  const shortCooldown = await prisma.waSenderLease.findUniqueOrThrow({ where: { phoneId: primary.id } });
  assert(shortCooldown.nextSendAt.getTime() - Date.now() < 2000, 'A pinned offline job must not block all jobs for 30 seconds');
  await prisma.waSenderLease.update({ where: { phoneId: primary.id }, data: { nextSendAt: new Date(0) } });
  modes.set(backup.id, 'ack');
  await worker.processPhone(primary.id);
  assert.equal((await prisma.waDispatch.findUniqueOrThrow({ where: { id: newerId } })).status, 'SENT', 'Newer unsent jobs can use a healthy backup while an older pinned job waits');
  await prisma.waDispatch.update({ where: { id }, data: { status: 'UNCERTAIN' } });
  console.log('PASS older pinned offline job does not starve newer unsent group jobs');

  sockets.get(third.id).ws.isOpen = true;
  id = await fresh('LEASES'); modes.set(backup.id, 'hold');
  await prisma.phone.update({ where: { id: third.id }, data: { active: 0 } });
  const secondQueued = await queue.enqueueDispatch(third.id, user.id, { ...body, job_id: 'OTHER-ORIGIN', transaction_id: 'OTHER-ORIGIN' });
  const secondId = secondQueued.data[0].id;
  await prisma.waDispatch.update({ where: { id: secondId }, data: { nextAttemptAt: new Date(0) } });
  const first = worker.processPhone(primary.id);
  await waitUntil(async () => { const current = await prisma.waDispatch.findUniqueOrThrow({ where: { id } }); return current.status === 'PROCESSING' && sends.some(send => send.messageId === current.messageId && send.phoneId === backup.id); });
  const before = sends.length;
  await worker.processPhone(primary.id);
  assert.equal(sends.length, before, 'Concurrent worker cannot duplicate a dispatch');
  const leased = await prisma.waSenderLease.findUniqueOrThrow({ where: { phoneId: backup.id } });
  assert(leased.leaseToken, 'Actual sender is leased too');
  await worker.processPhone(third.id);
  assert.equal(sends.length, before, 'A second origin must not concurrently use the leased backup');
  assert.equal((await prisma.waDispatch.findUniqueOrThrow({ where: { id: secondId } })).attempts, 0);
  const firstJob = await prisma.waDispatch.findUniqueOrThrow({ where: { id } });
  heldAcks.get(firstJob.messageId)({ tag: 'ack', attrs: {} }); await first;
  assert.equal((await prisma.waSenderLease.findUniqueOrThrow({ where: { phoneId: backup.id } })).leaseToken, null);
  modes.set(backup.id, 'ack'); await due(secondId); await worker.processPhone(third.id);
  assert.equal((await prisma.waDispatch.findUniqueOrThrow({ where: { id: secondId } })).status, 'SENT');
  await prisma.phone.update({ where: { id: third.id }, data: { active: 1 } });
  console.log('PASS concurrent claim exclusion, two-origin shared sender exclusion and lease release');

  id = await fresh('NO-GROUP');
  await prisma.senderGroup.update({ where: { id: group.id }, data: { enabled: false } });
  await worker.processPhone(primary.id);
  job = await prisma.waDispatch.findUniqueOrThrow({ where: { id } });
  assert.equal(job.senderPhoneId, null); assert.equal(job.lastError, 'DEVICE_INACTIVE');
  response = await api(sendApi, { method: 'POST', body: { ...body, job_id: 'DISABLED-GROUP' } });
  assert.equal(response.code, 409);
  console.log('PASS disabled group preserves legacy behavior');
  await prisma.waDispatch.update({ where: { id }, data: { status: 'FAILED' } });

  // Operating hours use the real clock; construct windows safely away from now.
  process.env.SETTINGS_ENCRYPTION_KEY = 'isolated-operating-hours-test-only';
  const globalApi = load('src/pages/api/admin/global-settings.ts').default;
  const policyApi = load('src/pages/api/device-policies.ts').default;
  const hoursUtil = load('src/lib/operatingHours.ts');
  const minute = (new Date().getUTCHours() * 60 + new Date().getUTCMinutes() + 7 * 60) % 1440;
  const clock = value => `${String(Math.floor(((value + 1440) % 1440) / 60)).padStart(2, '0')}:${String(((value + 1440) % 1440) % 60).padStart(2, '0')}`;
  const closedHours = { enabled: true, start: clock(minute + 60), end: clock(minute + 120) };
  const openHours = { enabled: true, start: clock(minute - 60), end: clock(minute + 60) };
  response = await api(globalApi, { user: admin });
  const hoursSetting = response.body.find(setting => setting.key === hoursUtil.OPERATING_HOURS_KEY);
  assert.deepEqual(JSON.parse(hoursSetting.value), hoursUtil.DEFAULT_OPERATING_HOURS, 'Schedule defaults to 24 hours');
  const saveGlobal = hours => api(globalApi, { method: 'PATCH', user: admin, body: { id: hoursSetting.id, label: hoursSetting.label, value: JSON.stringify(hours) } });
  response = await saveGlobal({ ...closedHours, end: closedHours.start });
  assert.equal(response.code, 400);
  response = await saveGlobal(closedHours); assert.equal(response.code, 200);
  await prisma.phone.update({ where: { id: primary.id }, data: { active: 1 } });
  mockSocket(primary);
  response = await api(policyApi, { user });
  const inherited = response.body.find(policy => policy.id === primary.id);
  assert.equal(inherited.operatingHours, null); assert.equal(inherited.operatingHoursState.open, false);
  const policyValues = { phoneId: primary.id, useGlobalQuota: true, dailyLimit: 200, minIntervalSeconds: null, maxIntervalSeconds: null, adaptiveEnabled: true, paused: false };
  response = await api(policyApi, { method: 'PUT', user: foreign, body: { ...policyValues, operatingHours: openHours } });
  assert.equal(response.code, 404, 'Cannot change another owner schedule');
  response = await api(policyApi, { method: 'PUT', user, body: { ...policyValues, operatingHours: { ...openHours, start: '24:00' } } });
  assert.equal(response.code, 400);
  id = await fresh('HOURS-GLOBAL-CLOSED');
  const beforeHours = sends.length;
  const usedBeforeHours = await prisma.deviceDailyUsage.count({ where: { phoneId: primary.id } });
  await worker.processPhone(primary.id);
  job = await prisma.waDispatch.findUniqueOrThrow({ where: { id } });
  assert.equal(job.status, 'QUEUED'); assert.equal(job.lastError, 'OUTSIDE_OPERATING_HOURS'); assert.equal(job.attempts, 0);
  assert.equal(sends.length, beforeHours);
  assert.equal(await prisma.deviceDailyUsage.count({ where: { phoneId: primary.id } }), usedBeforeHours, 'No quota reservation outside hours');
  response = await api(policyApi, { method: 'PUT', user, body: { ...policyValues, operatingHours: openHours } });
  assert.equal(response.code, 200);
  // Old clients omitting this new field must preserve the override.
  await api(policyApi, { method: 'PUT', user, body: policyValues });
  assert.deepEqual((await prisma.deviceSendPolicy.findUniqueOrThrow({ where: { phoneId: primary.id } })).operatingHours, openHours);
  await due(id); await worker.processPhone(primary.id);
  job = await prisma.waDispatch.findUniqueOrThrow({ where: { id } });
  assert.equal(job.status, 'SENT'); assert.equal(job.phoneId, primary.id); assert.equal(job.senderPhoneId, primary.id);
  await api(policyApi, { method: 'PUT', user, body: { ...policyValues, operatingHours: null } });
  assert.equal((await prisma.deviceSendPolicy.findUniqueOrThrow({ where: { phoneId: primary.id } })).operatingHours, null);
  console.log('PASS global/per-device schedule APIs, validation, owner scope, closed queue without attempts/quota, custom override and inheritance reset');

  await prisma.senderGroup.update({ where: { id: group.id }, data: { enabled: true } });
  await prisma.deviceSendPolicy.update({ where: { phoneId: backup.id }, data: { operatingHours: openHours } });
  id = await fresh('HOURS-GROUP-FALLBACK');
  await worker.processPhone(primary.id);
  job = await prisma.waDispatch.findUniqueOrThrow({ where: { id } });
  assert.equal(job.status, 'SENT'); assert.equal(job.senderPhoneId, backup.id, 'Online primary outside its hours must yield to an open backup');
  await prisma.deviceSendPolicy.update({ where: { phoneId: backup.id }, data: { operatingHours: require('@prisma/client').Prisma.DbNull } });
  id = await fresh('HOURS-ALL-CLOSED');
  await worker.processPhone(primary.id);
  job = await prisma.waDispatch.findUniqueOrThrow({ where: { id } });
  assert.equal(job.lastError, 'OUTSIDE_OPERATING_HOURS'); assert.equal(job.attempts, 0);
  // A global schedule change is observed on the next poll without a restart.
  await saveGlobal(openHours); await due(id); await worker.processPhone(primary.id);
  job = await prisma.waDispatch.findUniqueOrThrow({ where: { id } });
  assert.equal(job.status, 'SENT'); assert.equal(job.senderPhoneId, primary.id);
  console.log('PASS group fallback respects each actual sender schedule and resumes on global setting change');

  id = await fresh('HOURS-PINNED-RETRY');
  const pinnedId = randomUUID();
  await prisma.waDispatch.update({ where: { id }, data: { senderPhoneId: primary.id, messageId: pinnedId, attempts: 1, lastError: 'ACK_TIMEOUT_RETRY' } });
  await prisma.deviceSendPolicy.update({ where: { phoneId: primary.id }, data: { operatingHours: closedHours } });
  const beforePinnedHours = sends.length;
  await worker.processPhone(primary.id);
  job = await prisma.waDispatch.findUniqueOrThrow({ where: { id } });
  assert.equal(job.status, 'QUEUED'); assert.equal(job.lastError, 'OUTSIDE_OPERATING_HOURS');
  assert.equal(job.messageId, pinnedId); assert.equal(job.senderPhoneId, primary.id); assert.equal(job.attempts, 1);
  assert.equal(sends.length, beforePinnedHours, 'A healthy backup cannot take over a message awaiting ACK outside its sender hours');
  await prisma.deviceSendPolicy.update({ where: { phoneId: primary.id }, data: { operatingHours: openHours } });
  await due(id); await worker.processPhone(primary.id);
  job = await prisma.waDispatch.findUniqueOrThrow({ where: { id } });
  assert.equal(job.status, 'SENT'); assert.equal(job.messageId, pinnedId); assert.equal(job.senderPhoneId, primary.id);
  console.log('PASS ACK retry waits for its original sender hours and resumes with the same message ID');

  await prisma.senderGroup.update({ where: { id: group.id }, data: { enabled: false } });
  id = await fresh('HOURS-CROSSED-AFTER-CLAIM');
  const safety = load('src/server/messaging/safety.ts');
  const originalReserve = safety.reserveSend;
  const sendCount = sends.length;
  const priorUsage = await prisma.deviceDailyUsage.findUniqueOrThrow({ where: { phoneId_day: { phoneId: primary.id, day: safety.usageDay() } } });
  safety.reserveSend = async (...args) => {
    await prisma.deviceSendPolicy.update({ where: { phoneId: primary.id }, data: { operatingHours: closedHours } });
    return originalReserve(...args);
  };
  try { await worker.processPhone(primary.id); } finally { safety.reserveSend = originalReserve; }
  job = await prisma.waDispatch.findUniqueOrThrow({ where: { id } });
  assert.equal(job.status, 'QUEUED'); assert.equal(job.attempts, 0); assert.equal(job.messageId, null); assert.equal(job.lastError, 'OUTSIDE_OPERATING_HOURS');
  assert.equal(sends.length, sendCount);
  const afterGuardUsage = await prisma.deviceDailyUsage.findUniqueOrThrow({ where: { phoneId_day: { phoneId: primary.id, day: safety.usageDay() } } });
  assert.equal(afterGuardUsage.attempts, priorUsage.attempts);
  assert.equal(await prisma.waDispatchAttempt.count({ where: { dispatchId: id, status: 'SKIPPED', error: 'OUTSIDE_OPERATING_HOURS' } }), 1);
  await api(policyApi, { method: 'PUT', user, body: { ...policyValues, operatingHours: null } });
  await due(id); await worker.processPhone(primary.id);
  assert.equal((await prisma.waDispatch.findUniqueOrThrow({ where: { id } })).status, 'SENT');
  console.log('PASS final transport guard blocks hours changes after claim without consuming attempts or quota and resumes same dispatch');
  console.log('SENDER_GROUP_TESTS_PASSED (real MySQL, no real WhatsApp messages)');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
