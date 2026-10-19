import { randomUUID } from "node:crypto";
import { prisma } from "../../lib/prisma";
import { sendDeviceWebhook } from "../utils/sendDeviceWebhook";

export const retryDelay = (attempt: number) => Math.min(3600000, 5000 * 3 ** Math.max(0, attempt - 1));
const pending = ["PENDING", "SENDING"];

export async function processDeviceWebhook() {
  const claimed = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM device_webhook_settings WHERE id = 1 FOR UPDATE`;
    const config = await tx.deviceWebhookSetting.findUnique({ where: { id: 1 } });
    if (!config?.enabled) return null;
    // FIFO prevents an older token update overtaking a newer device event, across workers.
    const job = await tx.deviceWebhookEvent.findFirst({ where: { status: { in: pending } }, orderBy: { id: "asc" } });
    if (!job) return null;
    if (job.revision !== config.revision) {
      await tx.deviceWebhookEvent.update({ where: { id: job.id }, data: { status: "CANCELLED", payload: null, leaseToken: null, leaseUntil: null, lastError: "CONFIG_CHANGED" } });
      return null;
    }
    const now = new Date();
    if (job.status === "SENDING" && job.leaseUntil && job.leaseUntil > now || job.nextAttemptAt > now) return null;
    if (job.attempts >= 8 || now.getTime() - job.createdAt.getTime() > 24 * 3600000) {
      await tx.deviceWebhookEvent.update({ where: { id: job.id }, data: { status: "FAILED", payload: null, leaseToken: null, leaseUntil: null, lastError: "RETRY_EXHAUSTED" } });
      return null;
    }
    const leaseToken = randomUUID();
    await tx.deviceWebhookEvent.update({ where: { id: job.id }, data: { status: "SENDING", attempts: { increment: 1 }, leaseToken, leaseUntil: new Date(Date.now() + 60000) } });
    return { job, config, leaseToken };
  });
  if (!claimed) return false;
  const { job, config, leaseToken } = claimed;
  try {
    const current = await prisma.deviceWebhookSetting.findUnique({ where: { id: 1 } });
    if (!current?.enabled || current.revision !== config.revision) return false;
    await sendDeviceWebhook(config.url, { ...JSON.parse(job.payload!), sequence: job.id }, {
      Authorization: `Bearer ${config.secret}`, "X-Jeblast-Event-Id": job.eventId,
    });
    await prisma.deviceWebhookEvent.updateMany({ where: { id: job.id, leaseToken, status: "SENDING" },
      data: { status: "DELIVERED", deliveredAt: new Date(), payload: null, lastError: null, leaseToken: null, leaseUntil: null } });
  } catch {
    const exhausted = job.attempts + 1 >= 8;
    await prisma.deviceWebhookEvent.updateMany({ where: { id: job.id, leaseToken, status: "SENDING" }, data: {
      status: exhausted ? "FAILED" : "PENDING", ...(exhausted ? { payload: null } : {}), lastError: "DELIVERY_FAILED",
      nextAttemptAt: new Date(Date.now() + retryDelay(job.attempts + 1)), leaseToken: null, leaseUntil: null,
    } });
  }
  return true;
}

export function startDeviceWebhookWorker() {
  let stopping = false, busy = false, cleanupAt = 0;
  const tick = async () => {
    if (stopping || busy) return;
    busy = true;
    try {
      if (Date.now() - cleanupAt > 3600000) {
        await prisma.deviceWebhookEvent.deleteMany({ where: { status: { notIn: pending }, createdAt: { lt: new Date(Date.now() - 30 * 86400000) } } });
        cleanupAt = Date.now();
      }
      for (let i = 0; i < 10 && !stopping; i++) if (!await processDeviceWebhook()) break;
    } catch { console.error("DEVICE_CHANGE_WEBHOOK_WORKER_FAILED"); }
    finally { busy = false; }
  };
  const timer = setInterval(tick, 2000);
  void tick();
  return async () => { stopping = true; clearInterval(timer); while (busy) await new Promise(resolve => setTimeout(resolve, 50)); };
}
