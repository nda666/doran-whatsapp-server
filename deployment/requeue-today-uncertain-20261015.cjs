'use strict';
// One-off operation explicitly authorized for 15 October 2026 (Asia/Jakarta).
const fs = require('node:fs');
const app = '/home/jeblast/repos/doran-whatsapp-server';
require(app + '/node_modules/@next/env').loadEnvConfig(app);
const { prisma } = require(app + '/dist/src/lib/prisma');
const { updateDispatches } = require(app + '/dist/src/server/dispatchWebhook/events');
const start = new Date('2026-10-15T00:00:00+07:00');
const end = new Date('2026-10-16T00:00:00+07:00');

(async () => {
  const now = new Date();
  if (now < start || now >= end) throw new Error('OUTSIDE_AUTHORIZED_DATE');
  const where = { status: 'UNCERTAIN', createdAt: { gte: start, lt: end },
    sentAt: null, deliveredAt: null, readAt: null };
  const rows = await prisma.waDispatch.findMany({ where, orderBy: { id: 'asc' }, select: {
    id: true, phoneId: true, campaignId: true, status: true, attempts: true, messageId: true,
    lastError: true, nextAttemptAt: true, leaseToken: true, leaseUntil: true,
    sentAt: true, deliveredAt: true, readAt: true, createdAt: true, updatedAt: true,
  } });
  // Do not revive stopped campaigns as a side effect of this API-queue operation.
  if (rows.some(row => row.campaignId !== null)) throw new Error('CAMPAIGN_REQUIRES_SEPARATE_HANDLING');
  const backup = '/home/jeblast/backups/requeue-uncertain-20261015-' + now.getTime();
  fs.mkdirSync(backup, { mode: 0o700 });
  fs.writeFileSync(backup + '/before.json', JSON.stringify({ dateWIB: '2026-10-15', capturedAt: now, rows }, null, 2), { mode: 0o600 });
  console.log(JSON.stringify({ backup, selected: rows.length }));
  let changed = 0;
  for (let offset = 0; offset < rows.length; offset += 20) {
    const batch = rows.slice(offset, offset + 20);
    const count = await prisma.$transaction(async tx => {
      let total = 0;
      for (const row of batch) {
        // Skip a row if a receipt or another operation changed it since the snapshot.
        const result = await updateDispatches({ where: { ...where, id: row.id, updatedAt: row.updatedAt }, data: {
          status: 'QUEUED', attempts: 0, messageId: null, lastError: null,
          nextAttemptAt: new Date(), leaseToken: null, leaseUntil: null,
        } }, tx);
        total += result.count;
      }
      return total;
    }, { timeout: 30000 });
    changed += count;
    fs.appendFileSync(backup + '/progress.jsonl', JSON.stringify({ offset, selected: batch.length, changed: count }) + '\n', { mode: 0o600 });
  }
  const ids = rows.map(row => row.id);
  const states = ids.length ? await prisma.waDispatch.groupBy({ by: ['status'], where: { id: { in: ids } }, _count: { _all: true } }) : [];
  const events = ids.length ? await prisma.dispatchWebhookEvent.count({ where: { dispatchId: { in: ids }, createdAt: { gte: now } } }) : 0;
  const result = { completedAt: new Date(), dateWIB: '2026-10-15', selected: rows.length, requeued: changed,
    skippedConcurrentChanges: rows.length - changed, states, webhookEventsSinceStart: events, backup };
  fs.writeFileSync(backup + '/result.json', JSON.stringify(result, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(result));
})().catch(error => { console.error('REQUEUE_FAILED', error.name, error.code || ''); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
