'use strict';
// Explicit disposable-database check. No .env inference and no WhatsApp calls.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const url = new URL(process.env.DATABASE_URL || 'invalid:');
assert(process.env.WA_TRAFFIC_DB_TEST === '1' && url.protocol === 'mysql:' && ['127.0.0.1', 'localhost'].includes(url.hostname)
  && ['/doran_ci', '/wa_inbound_ci'].includes(url.pathname), 'Explicit disposable traffic database required');
const { PrismaClient } = require('@prisma/client');
const { prisma } = require('../src/lib/prisma.ts');
const { reserveTraffic, trafficContentHash } = require('../src/server/messaging/trafficGuard.ts');
const { DEFAULT_TRAFFIC_POLICY } = require('../src/lib/trafficSettings.ts');
const other = new PrismaClient();
const phoneId = randomUUID(), userId = randomUUID(), now = new Date();
const policy = { ...DEFAULT_TRAFFIC_POLICY, maxPerMinute: 3, identicalPerHour: 2, jitterMinMs: 0, jitterMaxMs: 0,
  reconnectCooldownSeconds: 30, rampFirstMinute: 3, rampSecondMinute: 3 };
const admit = (db, id, text = id) => db.$transaction(tx => reserveTraffic(tx, phoneId, { logicalId: id, contentHash: trafficContentHash({ text }) }, policy, now), { maxWait: 20000, timeout: 20000 });
(async () => {
  await prisma.user.create({ data: { id: userId, email: `${userId}@example.invalid`, name: 'Traffic test', password: 'not-for-login', token: randomUUID() } });
  await prisma.phone.create({ data: { id: phoneId, userId, name: 'Disposable traffic fixture' } });
  await prisma.deviceSendPolicy.create({ data: { phoneId } });
  const results = await Promise.allSettled(Array.from({ length: 12 }, (_, index) => admit(index % 2 ? prisma : other, `logical-${index}`)));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 3);
  for (const rejected of results.filter(result => result.status === 'rejected')) assert.equal(rejected.reason.code, 'DEVICE_THROTTLED');
  assert.equal(await prisma.waSendTraffic.count({ where: { phoneId } }), 3);
  await prisma.waSendTraffic.deleteMany({ where: { phoneId } });
  await assert.rejects(prisma.$transaction(async tx => {
    await reserveTraffic(tx, phoneId, { logicalId: 'rollback', contentHash: trafficContentHash({ text: 'rollback' }) }, policy, now);
    throw Error('LATER_ADMISSION_REJECTED');
  }), /LATER_ADMISSION_REJECTED/);
  assert.equal(await prisma.waSendTraffic.count({ where: { phoneId } }), 0);
  await admit(prisma, 'same-1', 'identical'); await admit(other, 'same-2', 'identical');
  await assert.rejects(admit(prisma, 'same-3', 'identical'), error => error.code === 'DEVICE_THROTTLED');
  await admit(other, 'same-1', 'identical');
  assert.equal(await prisma.waSendTraffic.count({ where: { phoneId } }), 3, 'Retry consumes rate budget while retaining logical identity');
  await prisma.waSendTraffic.deleteMany({ where: { phoneId } });
  await prisma.waSendRecovery.create({ data: { phoneId, connectedAt: now } });
  await assert.rejects(admit(prisma, 'cooldown'), error => error.code === 'DEVICE_THROTTLED' && error.retryAt.getTime() === now.getTime() + 30000);
  assert.equal(await prisma.waSendTraffic.count({ where: { phoneId } }), 0);
  console.log('TRAFFIC_MYSQL_CONCURRENCY_ROLLBACK_RETRY_COOLDOWN_OK');
  // Run the actual worker candidate SELECT against held jobs that already have a message ID.
  await prisma.waSenderLease.create({ data: { phoneId } });
  const job = await prisma.waDispatch.create({ data: { userId, phoneId, recipient: '6281234567890', storeId: 'fixture',
    transactionId: randomUUID(), messageKey: 'fixture', dedupeKey: randomUUID(), payloadHash: 'fixture', message: 'never sent',
    messageId: 'stable-fixture-id', status: 'QUEUED', lastError: 'ACCOUNT_INACTIVE', nextAttemptAt: new Date(now.getTime() - 1000), expiresAt: new Date(now.getTime() + 3600000) } });
  const source = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '../src/server/dispatch/worker.ts'), 'utf8');
  const template = source.split('const candidates = await prisma.$queryRaw<')[1]?.split('`')[1];
  assert(template && /^\s*SELECT\s/.test(template));
  const params = [];
  const query = template.replace(/\$\{(new Date\(\)|cutoff|senderOrder)\}/g, (_, name) => {
    if (name === 'senderOrder') return 'MIN(d.createdAt) ASC';
    params.push(name === 'cutoff' ? new Date(now.getTime() - 86400000) : new Date()); return '?';
  });
  assert(!query.includes('${') && !query.includes(';'));
  for (const lastError of ['ACCOUNT_INACTIVE', 'RECIPIENT_FREQUENCY']) {
    await prisma.waDispatch.update({ where: { id: job.id }, data: { lastError } });
    assert((await prisma.$queryRawUnsafe(query, ...params)).some(row => row.phoneId === phoneId), `${lastError} must remain selectable after its hold clears`);
  }
  console.log('HELD_DISPATCH_CANDIDATE_SELECT_OK');
})().finally(async () => {
  try {
    await prisma.waSendTraffic.deleteMany({ where: { phoneId } });
    await prisma.waSendRecovery.deleteMany({ where: { phoneId } });
    await prisma.waDispatch.deleteMany({ where: { phoneId } });
    await prisma.phone.deleteMany({ where: { id: phoneId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  } finally { await Promise.all([prisma.$disconnect(), other.$disconnect()]); }
}).catch(error => { console.error(error); process.exitCode = 1; });
