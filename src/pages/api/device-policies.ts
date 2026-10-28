import type { NextApiResponse } from "next";
import { z } from "zod";
import { effectiveQuotaReset, quotaResetInput, quotaWindowState } from "@/lib/quotaReset";
import { getQuotaReset } from "@/server/dispatch/settings";
import { Prisma } from "@prisma/client";
import { effectiveOperatingHours, operatingHoursInput, operatingHoursState } from "@/lib/operatingHours";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { AuthNextApiRequest } from "@/types/global";
import { prisma } from "@/lib/prisma";
import { phoneScope as ownerScope } from "@/lib/access";
import { healthAssessment, usageDay, warmupLimit } from "@/server/messaging/safety";
import { DEFAULT_DEVICE_DAILY_QUOTA, deviceDailyQuota } from "@/lib/deviceQuota";
import { getGlobalDeviceQuota, getDispatchDelayRange, getWarmupDailyLimits, getGlobalOperatingHours } from "@/server/dispatch/settings";
const input = z.object({ phoneId: z.string().uuid(), useGlobalQuota: z.boolean(), dailyLimit: z.number().int().min(1).max(100000), minIntervalSeconds: z.number().int().min(1).max(3600).nullable().default(null), maxIntervalSeconds: z.number().int().min(1).max(30).nullable().default(null), adaptiveEnabled: z.boolean(), paused: z.boolean(), operatingHours: operatingHoursInput.nullable().optional(), quotaReset: quotaResetInput.nullable().optional(), warmupAction: z.enum(["start", "stop"]).optional() }).refine(value => value.maxIntervalSeconds === null || (value.minIntervalSeconds !== null && value.maxIntervalSeconds >= value.minIntervalSeconds), "Hingga harus sama atau lebih besar dari Mulai.");
const restartInput = z.object({ phoneId: z.string().uuid(), action: z.literal("restart-warmup") }).strict();
export default apiAuthMiddleware(async (req: AuthNextApiRequest, res: NextApiResponse) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "PATCH") {
    const parsed = restartInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Permintaan ulang pemanasan tidak valid." });
    const { phoneId } = parsed.data;
    const result = await prisma.$transaction(async tx => {
      // Match phone edits/daily activation, then serialize with send reservations.
      await tx.$queryRaw`SELECT id FROM phones WHERE id = ${phoneId} FOR UPDATE`;
      const phone = await tx.phone.findFirst({ where: { id: phoneId, ...ownerScope(req.user!) }, select: { id: true } });
      if (!phone) return 404;
      const changed = await tx.deviceSendPolicy.updateMany({
        where: { phoneId, warmupStartedAt: { not: null } },
        data: { warmupStartedAt: new Date() },
      });
      return changed.count ? 200 : 409;
    });
    if (result === 404) return res.status(404).end();
    if (result === 409) return res.status(409).json({ message: "Pemanasan nomor sudah tidak aktif. Muat ulang data perangkat." });
    return res.json({ message: "Pemanasan diulang dari tahap pertama. Pemakaian kuota hari ini dan status jeda tetap berlaku." });
  }
  if (req.method === "GET") {
    const phones = await prisma.phone.findMany({ where: ownerScope(req.user!), select: { id: true, name: true, number: true, isOnline: true, lastSendProcessedAt: true } });
    const ids = phones.map(p => p.id);
    const [windows, quotaReset] = await Promise.all([prisma.deviceQuotaWindow.findMany({ where: { phoneId: { in: ids } } }), getQuotaReset()]);
    const windowMap = new Map(windows.map(window => [window.phoneId, window]));
    const [policies, usage, globalInterval, globalQuota, warmupLimits, globalOperatingHours] = await Promise.all([prisma.deviceSendPolicy.findMany({ where: { phoneId: { in: ids } } }), prisma.deviceDailyUsage.findMany({ where: { phoneId: { in: ids }, day: usageDay() } }), getDispatchDelayRange(), getGlobalDeviceQuota(), getWarmupDailyLimits(), getGlobalOperatingHours()]);
    return res.json(phones.map(phone => {
      const policy = policies.find(p => p.phoneId === phone.id) || { dailyLimit: DEFAULT_DEVICE_DAILY_QUOTA, useGlobalQuota: true, minIntervalSeconds: null, maxIntervalSeconds: null, adaptiveEnabled: true, paused: false, warmupStartedAt: null, operatingHours: null, quotaReset: null };
      const used = usage.find(u => u.phoneId === phone.id);
      const effectiveLimit = warmupLimit(policy.warmupStartedAt, deviceDailyQuota(policy, globalQuota), Date.now(), warmupLimits);
      const reset = effectiveQuotaReset(quotaReset, policy.quotaReset);
      const quota = quotaWindowState(windowMap.get(phone.id), used?.attempts || 0, effectiveLimit, reset);
      const effectiveHours = effectiveOperatingHours(globalOperatingHours, policy.operatingHours);
      return { ...policy, ...phone, globalInterval, globalQuota, globalOperatingHours, effectiveOperatingHours: effectiveHours, operatingHoursState: operatingHoursState(effectiveHours), globalQuotaReset: quotaReset, effectiveQuotaReset: reset, quotaResetAt: quota.resetAt, used: quota.used, effectiveLimit, health: healthAssessment(used?.attempts || 0, used?.failures || 0) };
    }));
  }
  if (req.method !== "PUT") return res.status(405).end();
  const parsed = input.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Batas dan interval pengiriman tidak valid." });
  const { phoneId, warmupAction, operatingHours, quotaReset, ...values } = parsed.data;
  if (!await prisma.phone.findFirst({ where: { id: phoneId, ...ownerScope(req.user!) } })) return res.status(404).end();
  const data = { ...values, ...(quotaReset === undefined ? {} : { quotaReset: quotaReset === null ? Prisma.DbNull : quotaReset }), ...(operatingHours === undefined ? {} : { operatingHours: operatingHours === null ? Prisma.DbNull : operatingHours }), ...(!values.paused ? { pauseReason: null } : {}), ...(warmupAction ? { warmupStartedAt: warmupAction === "start" ? new Date() : null } : {}) };
  return res.json(await prisma.deviceSendPolicy.upsert({ where: { phoneId }, create: { phoneId, ...data }, update: data }));
});
