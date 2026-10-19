import { DEFAULT_WARMUP_DAILY_LIMITS, WARMUP_DAILY_LIMITS_KEY, parseWarmupDailyLimits } from "../../lib/warmupSettings";
import { prisma } from "../../lib/prisma";
import { decryptSetting } from "../../lib/globalSettings";
import { DEFAULT_DISPATCH_MAX_AGE_DAYS, DISPATCH_MAX_AGE_DAYS_KEY, dispatchAgeCutoff, parseDispatchMaxAgeDays } from "../../lib/dispatchSettings";
import { DEFAULT_DISPATCH_QUEUE_ORDER, DISPATCH_QUEUE_ORDER_KEY, parseDispatchQueueOrder } from "../../lib/dispatchSettings";
import { DEFAULT_DISPATCH_DELAY, DISPATCH_DELAY_KEY, parseDispatchDelayRange } from "../../lib/dispatchSettings";

import { DEVICE_DAILY_QUOTA_KEY, DEFAULT_DEVICE_DAILY_QUOTA, parseDeviceDailyQuota } from "../../lib/deviceQuota";
export async function getGlobalDeviceQuota() {
  const setting = await prisma.globalSetting.findUnique({ where: { key: DEVICE_DAILY_QUOTA_KEY } });
  const quota = setting ? parseDeviceDailyQuota(decryptSetting(setting.value)) : DEFAULT_DEVICE_DAILY_QUOTA;
  if (quota === null) throw new Error("Invalid device daily quota setting");
  return quota;
}

export async function getDispatchDelayRange() {
  const setting = await prisma.globalSetting.findUnique({ where: { key: DISPATCH_DELAY_KEY } });
  const range = setting ? parseDispatchDelayRange(decryptSetting(setting.value)) : DEFAULT_DISPATCH_DELAY;
  if (!range) throw new Error("Invalid dispatch delay setting");
  return range;
}

export async function getDispatchQueueOrder() {
  const setting = await prisma.globalSetting.findUnique({ where: { key: DISPATCH_QUEUE_ORDER_KEY } });
  const order = setting ? parseDispatchQueueOrder(decryptSetting(setting.value)) : DEFAULT_DISPATCH_QUEUE_ORDER;
  if (order === null) throw new Error("Invalid dispatch queue order setting");
  return order;
}

export async function getDispatchMaxAgeDays() {
  const setting = await prisma.globalSetting.findUnique({ where: { key: DISPATCH_MAX_AGE_DAYS_KEY } });
  const days = setting ? parseDispatchMaxAgeDays(decryptSetting(setting.value)) : DEFAULT_DISPATCH_MAX_AGE_DAYS;
  if (days === null) throw new Error("Invalid dispatch maximum age setting");
  return days;
}

export async function getDispatchAgeCutoff() {
  return dispatchAgeCutoff(await getDispatchMaxAgeDays());
}

export async function getDispatchDisplayWindow() {
  const days = await getDispatchMaxAgeDays();
  const end = new Date();
  const start = dispatchAgeCutoff(days, end.getTime());
  return { days, start, end, createdAt: { gt: start } };
}

// API jobs use the current global limit, including jobs queued before it changed.
// Campaigns retain their scheduled delivery deadline in addition to the age limit.
export const dispatchDeadline = () => ({ OR: [{ campaignId: null }, { expiresAt: { gt: new Date() } }] });

export async function getWarmupDailyLimits() {
  const setting = await prisma.globalSetting.findUnique({ where: { key: WARMUP_DAILY_LIMITS_KEY } });
  const limits = setting ? parseWarmupDailyLimits(decryptSetting(setting.value)) : DEFAULT_WARMUP_DAILY_LIMITS;
  if (!limits) throw new Error("Invalid warmup daily limits setting");
  return limits;
}
