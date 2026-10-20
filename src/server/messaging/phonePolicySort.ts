import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { sortPhonePolicies, type PhonePolicySort } from "../../lib/phonePolicySort";
import { getDispatchDelayRange, getGlobalDeviceQuota, getWarmupDailyLimits } from "../dispatch/settings";
import { healthAssessment, usageDay, warmupLimit } from "./safety";
import { DEFAULT_DEVICE_DAILY_QUOTA, deviceDailyQuota } from "../../lib/deviceQuota";
import { deviceSendIntervalRange } from "../../lib/deviceSendInterval";

/** Apply today's effective quota to the authorized set before sorting/counting/pagination. */
export async function phoneQuotaWhere(where: Prisma.PhoneWhereInput, status: "fulfilled" | "available"): Promise<Prisma.PhoneWhereInput> {
  const phones = await prisma.phone.findMany({ where, select: { id: true } });
  const ids = phones.map(phone => phone.id);
  if (!ids.length) return { ...where, id: { in: [] } };
  const now = new Date();
  const [policies, usages, globalQuota, warmupLimits] = await Promise.all([
    prisma.deviceSendPolicy.findMany({ where: { phoneId: { in: ids } }, select: { phoneId: true, dailyLimit: true, useGlobalQuota: true, warmupStartedAt: true } }),
    prisma.deviceDailyUsage.findMany({ where: { phoneId: { in: ids }, day: usageDay(now) }, select: { phoneId: true, attempts: true } }),
    getGlobalDeviceQuota(), getWarmupDailyLimits(),
  ]);
  const policyMap = new Map(policies.map(policy => [policy.phoneId, policy]));
  const usageMap = new Map(usages.map(usage => [usage.phoneId, usage.attempts]));
  return { ...where, id: { in: ids.filter(id => {
    const policy = policyMap.get(id) || { dailyLimit: DEFAULT_DEVICE_DAILY_QUOTA, useGlobalQuota: true, warmupStartedAt: null };
    const limit = warmupLimit(policy.warmupStartedAt, deviceDailyQuota(policy, globalQuota), now.getTime(), warmupLimits);
    return ((usageMap.get(id) || 0) >= limit) === (status === "fulfilled");
  }) } };
}

/** Sort the entire authorized/filter-matched set before selecting a page. */
export async function phonePolicyPage(where: Prisma.PhoneWhereInput, field: PhonePolicySort, order: "asc" | "desc", skip: number, limit: number) {
  const phones = await prisma.phone.findMany({ where, select: { id: true } });
  if (!phones.length) return { ids: [], total: 0 };
  const ids = phones.map(phone => phone.id);
  const [policies, usages, globalInterval] = await Promise.all([
    field === "sendInterval" ? prisma.deviceSendPolicy.findMany({ where: { phoneId: { in: ids } }, select: { phoneId: true, minIntervalSeconds: true, maxIntervalSeconds: true, adaptiveEnabled: true } }) : [],
    prisma.deviceDailyUsage.findMany({ where: { phoneId: { in: ids }, day: usageDay() }, select: { phoneId: true, attempts: true, failures: true } }),
    field === "sendInterval" ? getDispatchDelayRange() : { minSeconds: 0, maxSeconds: 0 },
  ]);
  const policyMap = new Map(policies.map(policy => [policy.phoneId, policy]));
  const usageMap = new Map(usages.map(usage => [usage.phoneId, usage]));
  const rows = phones.map(phone => {
    const usage = usageMap.get(phone.id);
    const policy = policyMap.get(phone.id);
    const health = healthAssessment(usage?.attempts || 0, usage?.failures || 0);
    return {
      id: phone.id,
      health: health.score,
      quota: usage?.attempts || 0,
      sendInterval: deviceSendIntervalRange(globalInterval, policy).minSeconds * 1000 * (policy?.adaptiveEnabled === false ? 1 : health.multiplier),
    };
  });
  return { ids: sortPhonePolicies(rows, field, order).slice(skip, skip + limit).map(row => row.id), total: phones.length };
}
