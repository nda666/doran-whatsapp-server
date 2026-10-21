import { prisma } from "../../lib/prisma";
import { deviceDailyQuota } from "../../lib/deviceQuota";
import { healthAssessment, usageDay, warmupLimit } from "../messaging/safety";
import { getGlobalDeviceQuota, getWarmupDailyLimits } from "./settings";
import { getQuotaReset } from "./settings";
import { effectiveQuotaReset, quotaWindowState } from "../../lib/quotaReset";

// Revisit persisted daily-limit sleeps, including rows queued before a quota change
// or a worker restart. The transport still reserves every attempt against the limit.
export async function recoverQuotaDispatches(now = new Date()) {
  const waiting = { status: "QUEUED" as const, lastError: "DEVICE_DAILY_LIMIT",
    sentAt: null, deliveredAt: null, readAt: null };
  const senders = await prisma.waDispatch.findMany({ where: { ...waiting, nextAttemptAt: { gt: now } },
    distinct: ["phoneId"], select: { phoneId: true } });
  if (!senders.length) return;
  const [globalQuota, warmupLimits] = await Promise.all([getGlobalDeviceQuota(), getWarmupDailyLimits()]);
  const quotaReset = await getQuotaReset();
  for (const { phoneId } of senders) {
    const [policy, usage] = await Promise.all([
      prisma.deviceSendPolicy.findUnique({ where: { phoneId } }),
      prisma.deviceDailyUsage.findUnique({ where: { phoneId_day: { phoneId, day: usageDay(now) } } }),
    ]);
    if (!policy || policy.paused) continue;
    const attempts = usage?.attempts || 0;
    if (policy.adaptiveEnabled && healthAssessment(attempts, usage?.failures || 0).stop) continue;
    const window = await prisma.deviceQuotaWindow.findUnique({ where: { phoneId } });
    const limit = warmupLimit(policy.warmupStartedAt, deviceDailyQuota(policy, globalQuota), now.getTime(), warmupLimits);
    const quota = quotaWindowState(window, attempts, limit, effectiveQuotaReset(quotaReset, policy.quotaReset), now);
    if (quota.used >= limit) {
      // A setting change can shorten or extend an already persisted sleep.
      if (quota.resetAt) await prisma.$transaction(async tx => {
        const idle = await tx.waSenderLease.updateMany({ where: { phoneId,
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
          data: { nextSendAt: new Date(Math.max(quota.resetAt!.getTime(), policy.nextAllowedAt.getTime())) } });
        if (idle.count) await tx.waDispatch.updateMany({ where: { ...waiting, phoneId, nextAttemptAt: { gt: now } }, data: { nextAttemptAt: quota.resetAt! } });
      });
      continue;
    }
    await prisma.$transaction(async tx => {
      // Lock the idle sender before touching its jobs. An active worker owns its
      // cooldown and may still be persisting the original daily-limit rejection.
      const idle = await tx.waSenderLease.updateMany({ where: { phoneId,
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }] },
        data: { nextSendAt: new Date(Math.max(now.getTime(), policy.nextAllowedAt.getTime())) } });
      if (!idle.count) return;
      await tx.waDispatch.updateMany({ where: { ...waiting, phoneId, nextAttemptAt: { gt: now } },
        data: { nextAttemptAt: now } });
    });
  }
}
