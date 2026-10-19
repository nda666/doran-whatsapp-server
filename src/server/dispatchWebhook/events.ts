import { randomUUID } from "node:crypto";
import type { DispatchWebhookSetting, Prisma, WaDispatch } from "@prisma/client";
import { prisma } from "../../lib/prisma";

async function settings(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT id FROM dispatch_webhook_settings WHERE id = 1 FOR UPDATE`;
  return tx.dispatchWebhookSetting.findUnique({ where: { id: 1 } });
}

export function dispatchSnapshot(job: WaDispatch) {
  return { id: job.id, job_id: job.clientJobId, device_id: job.phoneId, user_id: job.userId,
    transaction_id: job.transactionId, store_id: job.storeId, message_key: job.messageKey,
    campaign_id: job.campaignId, source: job.source, recipient: job.recipient, status: job.status,
    message_id: job.messageId, attempts: job.attempts, error: job.lastError,
    created_at: job.createdAt, updated_at: job.updatedAt,
    next_attempt_at: job.status === "QUEUED" ? job.nextAttemptAt : null, sent_at: job.sentAt,
    delivered_at: job.deliveredAt, read_at: job.readAt };
}

function eventData(config: DispatchWebhookSetting, job?: WaDispatch, previousStatus: string | null = null) {
  const eventId = randomUUID();
  const event = job ? "dispatch.status_changed" : "dispatch.webhook.test";
  return { eventId, event, dispatchId: job?.id,
    revision: config.revision, payload: JSON.stringify({ event_id: eventId, event,
      occurred_at: new Date().toISOString(), previous_status: previousStatus,
      dispatch: job ? dispatchSnapshot(job) : null }) };
}

export async function enqueueDispatchEvent(tx: Prisma.TransactionClient, job?: WaDispatch, previousStatus: string | null = null) {
  const config = await settings(tx);
  if (!config?.enabled || !config.url || !config.secret) return;
  await tx.dispatchWebhookEvent.create({ data: eventData(config, job, previousStatus) });
}

// All status mutations and their outbox entries commit together. Configuration locking
// serializes these writers, so repeated receipts cannot enqueue duplicate transitions.
export async function updateDispatches(args: Prisma.WaDispatchUpdateManyArgs, tx?: Prisma.TransactionClient): Promise<Prisma.BatchPayload> {
  if (!args.data.status) return (tx || prisma).waDispatch.updateMany(args);
  if (!tx) {
    // Recovery can affect the entire queue; commit bounded batches so a large backlog
    // cannot repeatedly time out before making progress. Each transition stays atomic.
    let count = 0, cursor: string | undefined;
    while (true) {
      const rows = await prisma.waDispatch.findMany({ where: { AND: [args.where || {}, ...(cursor ? [{ id: { gt: cursor } }] : [])] },
        orderBy: { id: "asc" }, take: 250, select: { id: true } });
      if (!rows.length) break;
      const result = await prisma.$transaction(client => updateDispatches({ ...args,
        where: { AND: [args.where || {}, { id: { in: rows.map(row => row.id) } }] } }, client), { timeout: 30000 });
      count += result.count;
      cursor = rows[rows.length - 1].id;
      if (rows.length < 250) break;
    }
    return { count };
  }
  const config = await settings(tx);
  if (!config?.enabled || !args.data.status) return tx.waDispatch.updateMany(args);
  const before = await tx.waDispatch.findMany({ where: args.where, orderBy: { id: "asc" } });
  if (!before.length) return { count: 0 };
  // Recheck predicates in a locking/current read rather than relying on a transaction snapshot.
  let count = 0;
  for (const job of before) {
    const current = await tx.$queryRaw<Array<{ status: string }>>`SELECT status FROM wa_dispatches WHERE id = ${job.id} FOR UPDATE`;
    if (!current.length) continue;
    const changed = await tx.waDispatch.updateMany({ ...args, where: { AND: [args.where || {}, { id: job.id }] } });
    count += changed.count;
    if (!changed.count) continue;
    const after = await tx.waDispatch.findUniqueOrThrow({ where: { id: job.id } });
    if (after.status !== current[0].status) await tx.dispatchWebhookEvent.create({ data: eventData(config, after, current[0].status) });
  }
  return { count };
}

export async function createDispatches(tx: Prisma.TransactionClient, args: Prisma.WaDispatchCreateManyArgs) {
  const config = await settings(tx);
  const rows = Array.isArray(args.data) ? args.data : [args.data];
  const suppressions = await tx.recipientSuppression.findMany({ where: { OR: Array.from(new Set(rows.map(row => row.userId))).map(userId => ({ userId, number: { in: rows.filter(row => row.userId === userId).map(row => row.recipient) } })) }, select: { userId: true, number: true } });
  const blocked = new Set(suppressions.map(row => `${row.userId}:${row.number}`));
  const admitted = rows.map(row => blocked.has(`${row.userId}:${row.recipient}`) ? { ...row, status: "SUPPRESSED" as const, lastError: "RECIPIENT_OPTED_OUT" } : row);
  const ids = rows.map(row => row.id!).filter(Boolean);
  const existing = config?.enabled ? await tx.waDispatch.findMany({ where: { id: { in: ids } }, select: { id: true } }) : [];
  const oldIds = new Set(existing.map(job => job.id));
  const result = await tx.waDispatch.createMany({ ...args, data: admitted });
  if (config?.enabled && config.url && config.secret) {
    // Callers generate fresh UUIDs; deduplicated inserts keep the old UUID and emit no event.
    const jobs = await tx.waDispatch.findMany({ where: { id: { in: ids.filter(id => !oldIds.has(id)) } }, orderBy: { id: "asc" } });
    for (let offset = 0; offset < jobs.length; offset += 250) {
      await tx.dispatchWebhookEvent.createMany({ data: jobs.slice(offset, offset + 250).map(job => eventData(config, job)) });
    }
  }
  return result;
}
