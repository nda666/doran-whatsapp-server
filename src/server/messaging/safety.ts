import { DEFAULT_WARMUP_DAILY_LIMITS } from "../../lib/warmupSettings";
import { dispatchErrorLabels } from "../../lib/dispatchPresentation";
import { updateDispatches } from "../dispatchWebhook/events";
import { prisma } from "../../lib/prisma";
import { normalizePhoneRecipient } from "../../utils/normalizePhoneRecipient";
import { deviceDailyQuota } from "../../lib/deviceQuota";
import { getGlobalDeviceQuota, getDispatchDelayRange, getWarmupDailyLimits, getGlobalOperatingHours } from "../dispatch/settings";
import { effectiveOperatingHours, operatingHoursState } from "../../lib/operatingHours";
import { randomDispatchDelay } from "../dispatch/timing";
import { deviceSendIntervalRange } from "../../lib/deviceSendInterval";
import { effectiveQuotaReset, quotaWindowState } from "../../lib/quotaReset";
import { getQuotaReset } from "../dispatch/settings";

export function effectiveSendInterval(globalDelayMs: number, minimumSeconds: number | null, multiplier: number) {
  return Math.max(globalDelayMs, (minimumSeconds ?? 0) * 1000) * multiplier;
}

export const usageDay = (now = new Date()) => new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10);
export function warmupLimit(start: Date | null, maximum: number, now = Date.now(), limits: readonly number[] = DEFAULT_WARMUP_DAILY_LIMITS) {
  if (!start) return maximum;
  const days = Math.max(0, Math.floor((now - start.getTime()) / 86400000));
  return Math.min(maximum, limits[Math.floor(days / 2)] ?? maximum);
}
export function healthAssessment(attempts: number, failures: number) {
  if (attempts < 20) return { score: null, reason: "Data belum cukup (minimal 20 percobaan hari ini)", multiplier: 1, stop: false };
  const rate = failures / attempts;
  return { score: Math.max(0, Math.round(100 - rate * 100)), reason: `${failures} dari ${attempts} percobaan mengalami kesalahan transport atau konfirmasi hari ini`, multiplier: rate >= .1 ? 3 : 1, stop: rate >= .3 };
}
export class SendGuardError extends Error {
  constructor(public code: string, public retryAt?: Date) { super(dispatchErrorLabels[code] || code); }
}
export async function recipientBlocked(userId: string, number: string) {
  return !!await prisma.recipientSuppression.findUnique({ where: { userId_number: { userId, number } } });
}
export async function captureStop(userId: string, jid: string, text: string) {
  if (!/^\s*(STOP|BERHENTI|UNSUBSCRIBE)[.!\s]*$/i.test(text) || !jid.endsWith("@s.whatsapp.net")) return false;
  const preference = await prisma.messagingPreference.findUnique({ where: { userId } });
  if (preference?.optOutEnabled === false) return false;
  const number = normalizePhoneRecipient(`+${jid.split("@")[0].split(":")[0]}`);
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
    const now = new Date();
    await tx.recipientSuppression.upsert({ where: { userId_number: { userId, number } },
      create: { userId, number, source: "STOP", reason: "Permintaan berhenti dari penerima" }, update: { createdAt: now } });
    await tx.recipientConsent.updateMany({ where: { userId, number, revokedAt: null }, data: { revokedAt: now } });
    await tx.recipientConsentEvent.create({ data: { userId, number, purpose: "ALL", action: "REVOKED", source: "STOP", evidence: "Permintaan berhenti dari penerima", occurredAt: now } });
    await updateDispatches({ where: { userId, recipient: number, status: "QUEUED" }, data: { status: "SUPPRESSED", lastError: "RECIPIENT_OPTED_OUT" } }, tx);
  });
  return true;
}

/** Shared transport boundary: every API, campaign, conversation and auto reply passes here. */
export async function reserveSend(userId: string, phoneId: string, jid: string) {
  const number = jid.startsWith("+") ? normalizePhoneRecipient(jid) : jid.endsWith("@s.whatsapp.net") ? normalizePhoneRecipient(`+${jid.split("@")[0].split(":")[0]}`) : null;
  if (number && await recipientBlocked(userId, number)) throw new SendGuardError("RECIPIENT_OPTED_OUT");
  const globalQuota = await getGlobalDeviceQuota();
  const globalRange = await getDispatchDelayRange();
  const warmupLimits = await getWarmupDailyLimits();
  const globalHours = await getGlobalOperatingHours();
  const quotaReset = await getQuotaReset();
  await prisma.deviceSendPolicy.createMany({ data: [{ phoneId }], skipDuplicates: true });
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT phoneId FROM device_send_policies WHERE phoneId = ${phoneId} FOR UPDATE`;
    const policy = await tx.deviceSendPolicy.findUniqueOrThrow({ where: { phoneId } });
    const hours = operatingHoursState(effectiveOperatingHours(globalHours, policy.operatingHours));
    if (!hours.open) throw new SendGuardError("OUTSIDE_OPERATING_HOURS", hours.nextOpenAt!);
    const day = usageDay();
    const usage = await tx.deviceDailyUsage.upsert({ where: { phoneId_day: { phoneId, day } }, create: { phoneId, day }, update: {} });
    const health = healthAssessment(usage.attempts, usage.failures);
    if (policy.paused || (policy.adaptiveEnabled && health.stop)) throw new SendGuardError("DEVICE_SAFETY_PAUSED", new Date(Date.now() + 300000));
    const now = new Date();
    const limit = warmupLimit(policy.warmupStartedAt, deviceDailyQuota(policy, globalQuota), now.getTime(), warmupLimits);
    const window = await tx.deviceQuotaWindow.findUnique({ where: { phoneId } });
    const quota = quotaWindowState(window, usage.attempts, limit, effectiveQuotaReset(quotaReset, policy.quotaReset), now);
    if (quota.used >= limit) throw new SendGuardError("DEVICE_DAILY_LIMIT", quota.resetAt!);
    if (policy.nextAllowedAt > new Date()) throw new SendGuardError("DEVICE_THROTTLED", policy.nextAllowedAt);
    await tx.deviceDailyUsage.update({ where: { phoneId_day: { phoneId, day } }, data: { attempts: { increment: 1 } } });
    const quotaData = { attempts: quota.used + 1, startedAt: quota.startedAt, lastAttemptAt: now,
      reachedAt: quota.used + 1 >= limit ? quota.reachedAt ?? now : null };
    await tx.deviceQuotaWindow.upsert({ where: { phoneId }, create: { phoneId, ...quotaData }, update: quotaData });
    // Match the quota admission event, including retries, before transport runs.
    await tx.phone.update({ where: { id: phoneId }, data: { lastSendProcessedAt: new Date() } });
    const multiplier = policy.adaptiveEnabled ? health.multiplier : 1;
    const interval = policy.maxIntervalSeconds == null
      ? effectiveSendInterval(randomDispatchDelay(globalRange), policy.minIntervalSeconds, multiplier)
      : randomDispatchDelay(deviceSendIntervalRange(globalRange, policy)) * multiplier;
    await tx.deviceSendPolicy.update({ where: { phoneId }, data: { nextAllowedAt: new Date(Date.now() + interval) } });
    return day;
  });
}
