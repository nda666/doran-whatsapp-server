'use strict';
// Run only after the sender worker is stopped, immediately before promotion.
const fs = require('node:fs'), assert = require('node:assert/strict');
const app = '/home/jeblast/repos/doran-whatsapp-server';
require(app + '/node_modules/@next/env').loadEnvConfig(app);
const { prisma } = require(app + '/dist/src/lib/prisma');
const { updateDispatches } = require(app + '/dist/src/server/dispatchWebhook/events');
const [mode, directory] = process.argv.slice(2);
const day = { gte: new Date('2026-10-15T00:00:00+07:00'), lt: new Date('2026-10-16T00:00:00+07:00') };

(async () => {
  assert(['reset', 'restore'].includes(mode));
  assert(directory && directory.startsWith('/home/jeblast/backups/'));
  const file = directory + '/phone-requeue-before.json';
  if (mode === 'restore') {
    if (!fs.existsSync(file)) return;
    const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'));
    let restored = 0;
    for (const original of snapshot.rows) {
      const { id, updatedAt, ...data } = original;
      for (const field of ['createdAt', 'expiresAt', 'nextAttemptAt', 'leaseUntil', 'sentAt', 'deliveredAt', 'readAt']) {
        if (data[field]) data[field] = new Date(data[field]);
      }
      const result = await updateDispatches({ where: { id, status: 'QUEUED', attempts: 0,
        messageId: null, createdAt: new Date(snapshot.resetAt) }, data });
      restored += result.count;
    }
    console.log(JSON.stringify({ operation: 'restore', restored }));
    return;
  }
  const now = new Date();
  assert(now >= day.gte && now < day.lt, 'Outside authorized date');
  const phone = await prisma.phone.findFirst({ where: { number: '6285217857965' }, select: { id: true } });
  assert(phone, 'Sender not found');
  const filter = { phoneId: phone.id, status: 'UNCERTAIN', createdAt: day,
    sentAt: null, deliveredAt: null, readAt: null };
  const rows = await prisma.waDispatch.findMany({ where: filter, select: {
    id: true, status: true, attempts: true, messageId: true, lastError: true,
    nextAttemptAt: true, leaseToken: true, leaseUntil: true,
    createdAt: true, updatedAt: true, expiresAt: true, sentAt: true, deliveredAt: true, readAt: true,
  } });
  const campaignCount = await prisma.waDispatch.count({ where: { ...filter, campaignId: { not: null } } });
  assert.equal(campaignCount, 0, 'Do not revive campaigns');
  fs.writeFileSync(file, JSON.stringify({ phoneId: phone.id, resetAt: now, rows }, null, 2), { mode: 0o600, flag: 'wx' });
  let changed = 0;
  for (let offset = 0; offset < rows.length; offset += 20) {
    changed += await prisma.$transaction(async tx => {
      let count = 0;
      for (const row of rows.slice(offset, offset + 20)) {
        const result = await updateDispatches({ where: { ...filter, id: row.id, updatedAt: row.updatedAt }, data: {
          status: 'QUEUED', attempts: 0, messageId: null, lastError: null,
          createdAt: now, nextAttemptAt: now, expiresAt: new Date(now.getTime() + 86400000),
          leaseToken: null, leaseUntil: null,
        } }, tx);
        count += result.count;
      }
      return count;
    }, { timeout: 30000 });
  }
  const queued = rows.length ? await prisma.waDispatch.count({ where: { id: { in: rows.map(row => row.id) },
    status: 'QUEUED', attempts: 0, messageId: null, lastError: null, createdAt: now } }) : 0;
  assert.equal(queued, changed);
  const result = { operation: 'reset', phone: '6285217857965', selected: rows.length, reset: changed,
    skippedConcurrentChanges: rows.length - changed, verifiedFreshQueued: queued, resetAt: now };
  fs.writeFileSync(directory + '/phone-requeue-result.json', JSON.stringify(result, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(result));
})().catch(error => { console.error('PHONE_REQUEUE_FAILED', error.name, error.code || ''); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
