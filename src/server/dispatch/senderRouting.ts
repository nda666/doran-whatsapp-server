import type { Phone, WaDispatch } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { session } from "../libs/makeWASocket";
import { phoneMaintenance } from "../libs/phoneMaintenance";
import { healthAssessment, usageDay, warmupLimit } from "../messaging/safety";
import { deviceDailyQuota, DEFAULT_DEVICE_DAILY_QUOTA } from "../../lib/deviceQuota";
import { getGlobalDeviceQuota, getWarmupDailyLimits, getGlobalOperatingHours } from "./settings";
import { effectiveOperatingHours, operatingHoursState } from "../../lib/operatingHours";
import { getQuotaReset } from "./settings";
import { DEFAULT_QUOTA_RESET, effectiveQuotaReset, quotaWindowState } from "../../lib/quotaReset";
import { hasEnabledSenderGroup } from "./senderGroups";
import { conflictingSender, senderMembershipSelect } from "./senderNumberMembership";
import { isTelegramDevice } from "../../lib/messagingChannel";
import { telegramEnabled } from "../telegram/availability";

// A message ID can have late receipts, even after a timeout. Never change its sender.
export function pinnedSender(job: Pick<WaDispatch, "phoneId" | "senderPhoneId" | "messageId">) {
  return job.messageId ? job.senderPhoneId || job.phoneId : null;
}

export async function selectDispatchSender(origin: Phone, job: WaDispatch, token: string, leaseMs: number) {
  // Manual assignments have no group, and remain independent on ACK retries.
  const manual = !!job.senderPhoneId && !job.senderGroupId;
  const assigned = manual && !job.messageId ? job.senderPhoneId : null;
  const grouped = !manual && job.source === "API" && !job.campaignId && await hasEnabledSenderGroup(origin);
  const pinned = pinnedSender(job);
  const telegram = isTelegramDevice(origin);
  // A pinned sender remains usable after membership changes, but only within the owner.
  const phones = pinned || assigned
    ? await prisma.phone.findMany({ where: { id: (pinned || assigned)!, userId: origin.userId } })
    : grouped
      ? await prisma.phone.findMany({ where: { senderGroupId: origin.senderGroupId, userId: origin.userId }, orderBy: [{ senderPriority: "asc" }, { id: "asc" }] })
      : [origin];
  // Preserve the caller's primary number; priority orders the fallback numbers.
  if (!pinned && !assigned) phones.sort((a, b) => Number(b.id === origin.id) - Number(a.id === origin.id));
  const [globalQuota, warmupLimits] = grouped ? await Promise.all([getGlobalDeviceQuota(), getWarmupDailyLimits()]) : [0, []];
  const globalHours = await getGlobalOperatingHours();
  const quotaReset = grouped ? await getQuotaReset() : DEFAULT_QUOTA_RESET;
  const members = grouped ? await prisma.phone.findMany({ where: { senderGroupId: { not: null } }, select: senderMembershipSelect }) : [];
  let outsideHours = false;
  for (const phone of phones) {
    // Never deliver a WhatsApp request via Telegram (or the reverse) on fallback.
    if (isTelegramDevice(phone) !== telegram) continue;
    // Existing conflicts stay visible for admin review, but cannot route new work.
    if (grouped && !pinned && conflictingSender(phone, members)) continue;
    const socket = session.get(phone.id);
    if (phone.active !== 1 || phoneMaintenance.has(phone.id) || (telegram ? !telegramEnabled() : process.env.WHATSAPP_ENABLED === "false" || !socket?.ws.isOpen || !socket.user)) continue;
    const savedPolicy = await prisma.deviceSendPolicy.findUnique({ where: { phoneId: phone.id } });
    if (!operatingHoursState(effectiveOperatingHours(globalHours, savedPolicy?.operatingHours)).open) {
      outsideHours = true;
      continue;
    }
    if (grouped) {
      const usage = await prisma.deviceDailyUsage.findUnique({ where: { phoneId_day: { phoneId: phone.id, day: usageDay() } } });
      const policy = savedPolicy || { dailyLimit: DEFAULT_DEVICE_DAILY_QUOTA, useGlobalQuota: true, paused: false,
        adaptiveEnabled: true, warmupStartedAt: null, nextAllowedAt: new Date(0) };
      if (policy.paused || policy.nextAllowedAt > new Date()) continue;
      if (policy.adaptiveEnabled && healthAssessment(usage?.attempts || 0, usage?.failures || 0).stop) continue;
      const limit = warmupLimit(policy.warmupStartedAt, deviceDailyQuota(policy, globalQuota), Date.now(), warmupLimits);
      const window = await prisma.deviceQuotaWindow.findUnique({ where: { phoneId: phone.id } });
      if (quotaWindowState(window, usage?.attempts || 0, limit, effectiveQuotaReset(quotaReset, savedPolicy?.quotaReset)).used >= limit) continue;
    }
    if (phone.id !== origin.id) {
      await prisma.waSenderLease.createMany({ data: [{ phoneId: phone.id }], skipDuplicates: true });
      const held = await prisma.waSenderLease.updateMany({ where: { phoneId: phone.id, nextSendAt: { lte: new Date() },
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }] },
        data: { leaseToken: token, leaseUntil: new Date(Date.now() + leaseMs) } });
      if (!held.count) continue;
    }
    return { phone, socket, groupId: assigned ? null : grouped ? origin.senderGroupId : job.senderGroupId,
      grouped, leased: phone.id !== origin.id, outsideHours: false };
  }
  return { grouped, phone: null, socket: null, groupId: grouped ? origin.senderGroupId : job.senderGroupId, leased: false, outsideHours };
}
