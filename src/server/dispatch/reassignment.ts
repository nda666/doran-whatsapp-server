import type { Phone, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { session } from "../libs/makeWASocket";
import { phoneMaintenance } from "../libs/phoneMaintenance";
import { healthAssessment, usageDay, warmupLimit } from "../messaging/safety";
import { deviceDailyQuota, DEFAULT_DEVICE_DAILY_QUOTA } from "../../lib/deviceQuota";
import { effectiveQuotaReset, quotaWindowState } from "../../lib/quotaReset";
import { getDispatchAgeCutoff, getGlobalDeviceQuota, getQuotaReset, getWarmupDailyLimits } from "./settings";
import { isTelegramDevice } from "../../lib/messagingChannel";
import { telegramEnabled } from "../telegram/availability";

// A sender assignment never changes the origin used for authentication/deduplication.
export const assignedSenderWhere = (phoneId: string): Prisma.WaDispatchWhereInput => ({
  OR: [{ senderPhoneId: phoneId }, { senderPhoneId: null, phoneId }],
});

export async function reassignmentWhere(phone: Phone): Promise<Prisma.WaDispatchWhereInput> {
  const now = new Date(), cutoff = await getDispatchAgeCutoff();
  const { saved: policy, used, limit } = await senderQuota(phone);
  const restricted = !!(policy?.paused && policy.pauseReason);
  const quotaFull = used >= limit;
  return {
    userId: phone.userId, status: "QUEUED", messageId: null,
    sentAt: null, deliveredAt: null, readAt: null, leaseToken: null,
    // Even legacy rows without a message ID must not have an ambiguous transport attempt.
    sendAttempts: { none: { status: { not: "SKIPPED" } } },
    AND: [assignedSenderWhere(phone.id),
      { OR: [{ createdAt: { gt: cutoff } }, { campaign: { scheduledAt: { gt: cutoff } } }] },
      { OR: [{ campaignId: null }, { expiresAt: { gt: now }, campaign: { status: { in: ["WAITING", "PROCESSING"] }, scheduledAt: { lte: now } } }] },
      phone.active !== 1 ? { id: { in: [] } } : (isTelegramDevice(phone) ? telegramEnabled() : phone.status === "OPEN") && !restricted && !quotaFull
        ? { lastError: "DEVICE_OFFLINE" }
        : { OR: [{ lastError: null }, { lastError: { notIn: ["SENDER_GROUP_UNAVAILABLE", "OUTSIDE_OPERATING_HOURS", "SENDER_REJECTED_RETRY"] } }] },
    ],
  };
}

async function senderQuota(phone: Phone) {
  const [saved, usage, window, globalQuota, limits, reset] = await Promise.all([
    prisma.deviceSendPolicy.findUnique({ where: { phoneId: phone.id } }),
    prisma.deviceDailyUsage.findUnique({ where: { phoneId_day: { phoneId: phone.id, day: usageDay() } } }),
    prisma.deviceQuotaWindow.findUnique({ where: { phoneId: phone.id } }),
    getGlobalDeviceQuota(), getWarmupDailyLimits(), getQuotaReset(),
  ]);
  const policy = saved || { dailyLimit: DEFAULT_DEVICE_DAILY_QUOTA, useGlobalQuota: true };
  const limit = warmupLimit(saved?.warmupStartedAt || null, deviceDailyQuota(policy, globalQuota), Date.now(), limits);
  const used = quotaWindowState(window, usage?.attempts || 0, limit, effectiveQuotaReset(reset, saved?.quotaReset)).used;
  return { saved, usage, used, limit };
}

// This is a preview, never a reservation. The normal transport guard reserves
// quota atomically and rechecks hours, pauses, health, warmup and intervals.
export async function replacementQuota(phone: Phone) {
  const socket = session.get(phone.id);
  if (phone.active !== 1 || phoneMaintenance.has(phone.id) || (isTelegramDevice(phone) ? !telegramEnabled() : process.env.WHATSAPP_ENABLED === "false" || !socket?.ws.isOpen || !socket.user)) return null;
  const { saved, usage, used, limit } = await senderQuota(phone);
  if (saved?.paused || healthAssessment(usage?.attempts || 0, usage?.failures || 0).stop) return null;
  return used < limit ? { remaining: limit - used, limit } : null;
}
