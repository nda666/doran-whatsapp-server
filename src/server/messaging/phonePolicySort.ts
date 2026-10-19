import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { sortPhonePolicies, type PhonePolicySort } from "../../lib/phonePolicySort";
import { getDispatchDelayRange } from "../dispatch/settings";
import { healthAssessment, usageDay } from "./safety";
import { deviceSendIntervalRange } from "../../lib/deviceSendInterval";

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
