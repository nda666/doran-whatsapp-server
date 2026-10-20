import { randomUUID } from "node:crypto";
import { prisma } from "../../lib/prisma";
import { sendDeviceWebhook } from "../utils/sendDeviceWebhook";
import { webhookWorkerRetry } from "../utils/webhookWorkerRetry";

export const retryDelay = (attempt: number) => Math.min(3600000, 5000 * 3 ** Math.max(0, attempt - 1));
const pending = ["PENDING", "SENDING"];

export async function processDispatchWebhook() {
  const claimed = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM dispatch_webhook_settings WHERE id = 1 FOR UPDATE`;
    const config = await tx.dispatchWebhookSetting.findUnique({ where: { id: 1 } });
    if (!config?.enabled) return null;
    // FIFO prevents an older dispatch status overtaking a newer event, across workers.
    const job = await tx.dispatchWebhookEvent.findFirst({ where: { status: { in: pending } }, orderBy: { id: "asc" } });
    if (!job) return null;
    if (job.revision !== config.revision) {
      await tx.dispatchWebhookEvent.update({ where: { id: job.id }, data: { status: "CANCELLED", payload: null, leaseToken: null, leaseUntil: null, lastError: "CONFIG_CHANGED" } });
      return null;
    }
    const now = new Date();
    if (job.status === "SENDING" && job.leaseUntil && job.leaseUntil > now || job.nextAttemptAt > now) return null;
    if (job.attempts >= 8 || now.getTime() - job.createdAt.getTime() > 24 * 3600000) {
      await tx.dispatchWebhookEvent.update({ where: { id: job.id }, data: { status: "FAILED", payload: null, leaseToken: null, leaseUntil: null, lastError: "RETRY_EXHAUSTED" } });
      return null;
    }
    const leaseToken = randomUUID();
    await tx.dispatchWebhookEvent.update({ where: { id: job.id }, data: { status: "SENDING", attempts: { increment: 1 }, leaseToken, leaseUntil: new Date(Date.now() + 60000) } });
    return { job, config, leaseToken };
  });
  if (!claimed) return false;
  const { job, config, leaseToken } = claimed;
  try {
    const current = await prisma.dispatchWebhookSetting.findUnique({ where: { id: 1 } });
    if (!current?.enabled || current.revision !== config.revision) return false;
    await sendDeviceWebhook(config.url, { ...JSON.parse(job.payload!), sequence: job.id }, {
      Authorization: `Bearer ${config.secret}`, "X-Jeblast-Event-Id": job.eventId,
    });
    await prisma.dispatchWebhookEvent.updateMany({ where: { id: job.id, leaseToken, status: "SENDING" },
      data: { status: "DELIVERED", deliveredAt: new Date(), payload: null, lastError: null, leaseToken: null, leaseUntil: null } });
  } catch {
    const exhausted = job.attempts + 1 >= 8;
    await prisma.dispatchWebhookEvent.updateMany({ where: { id: job.id, leaseToken, status: "SENDING" }, data: {
      status: exhausted ? "FAILED" : "PENDING", ...(exhausted ? { payload: null } : {}), lastError: "DELIVERY_FAILED",
      nextAttemptAt: new Date(Date.now() + retryDelay(job.attempts + 1)), leaseToken: null, leaseUntil: null,
    } });
  }
  return true;
}

export function startDispatchWebhookWorker() {
  let stopping = false, busy = false, cleanupAt = 0;
  const retry = webhookWorkerRetry("DISPATCH_STATUS_WEBHOOK_WORKER_FAILED");
  const tick = async () => {
    if (stopping || busy || !retry.ready()) return;
    busy = true;
    try {
      if (Date.now() - cleanupAt > 3600000) {
        await prisma.dispatchWebhookEvent.deleteMany({ where: { status: { notIn: pending }, createdAt: { lt: new Date(Date.now() - 30 * 86400000) } } });
        cleanupAt = Date.now();
      }
      for (let i = 0; i < 10 && !stopping; i++) if (!await processDispatchWebhook()) break;
      retry.reset();
    } catch (error) { retry.fail(error); }
    finally { busy = false; }
  };
  const timer = setInterval(tick, 2000);
  void tick();
  return async () => { stopping = true; clearInterval(timer); while (busy) await new Promise(resolve => setTimeout(resolve, 50)); };
}
