import type { NextApiResponse } from "next";
import { z } from "zod";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { AuthNextApiRequest } from "@/types/global";
import { prisma } from "@/lib/prisma";
import { ownerScope } from "@/lib/access";
import { healthAssessment, usageDay, warmupLimit } from "@/server/messaging/safety";
import { DEFAULT_DEVICE_DAILY_QUOTA, deviceDailyQuota } from "@/lib/deviceQuota";
import { getGlobalDeviceQuota, getDispatchDelayRange, getWarmupDailyLimits } from "@/server/dispatch/settings";
const input = z.object({ phoneId: z.string().uuid(), useGlobalQuota: z.boolean(), dailyLimit: z.number().int().min(1).max(100000), minIntervalSeconds: z.number().int().min(1).max(3600).nullable().default(null), maxIntervalSeconds: z.number().int().min(1).max(30).nullable().default(null), adaptiveEnabled: z.boolean(), paused: z.boolean(), warmupAction: z.enum(["start", "stop"]).optional() }).refine(value => value.maxIntervalSeconds === null || (value.minIntervalSeconds !== null && value.maxIntervalSeconds >= value.minIntervalSeconds), "Hingga harus sama atau lebih besar dari Mulai.");
export default apiAuthMiddleware(async (req: AuthNextApiRequest, res: NextApiResponse) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") {
    const phones = await prisma.phone.findMany({ where: ownerScope(req.user!), select: { id: true, name: true, number: true, isOnline: true, lastSendProcessedAt: true } });
    const ids = phones.map(p => p.id);
    const [policies, usage, globalInterval, globalQuota, warmupLimits] = await Promise.all([prisma.deviceSendPolicy.findMany({ where: { phoneId: { in: ids } } }), prisma.deviceDailyUsage.findMany({ where: { phoneId: { in: ids }, day: usageDay() } }), getDispatchDelayRange(), getGlobalDeviceQuota(), getWarmupDailyLimits()]);
    return res.json(phones.map(phone => {
      const policy = policies.find(p => p.phoneId === phone.id) || { dailyLimit: DEFAULT_DEVICE_DAILY_QUOTA, useGlobalQuota: true, minIntervalSeconds: null, maxIntervalSeconds: null, adaptiveEnabled: true, paused: false, warmupStartedAt: null };
      const used = usage.find(u => u.phoneId === phone.id);
      return { ...policy, ...phone, globalInterval, globalQuota, used: used?.attempts || 0, effectiveLimit: warmupLimit(policy.warmupStartedAt, deviceDailyQuota(policy, globalQuota), Date.now(), warmupLimits), health: healthAssessment(used?.attempts || 0, used?.failures || 0) };
    }));
  }
  if (req.method !== "PUT") return res.status(405).end();
  const parsed = input.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Batas dan interval pengiriman tidak valid." });
  const { phoneId, warmupAction, ...values } = parsed.data;
  if (!await prisma.phone.findFirst({ where: { id: phoneId, ...ownerScope(req.user!) } })) return res.status(404).end();
  const data = { ...values, ...(!values.paused ? { pauseReason: null } : {}), ...(warmupAction ? { warmupStartedAt: warmupAction === "start" ? new Date() : null } : {}) };
  return res.json(await prisma.deviceSendPolicy.upsert({ where: { phoneId }, create: { phoneId, ...data }, update: data }));
});
