export const DEVICE_DAILY_QUOTA_KEY = "device-daily-quota";
export const DEVICE_DAILY_QUOTA_LABEL = "Kuota pengiriman harian per nomor";
export const DEFAULT_DEVICE_DAILY_QUOTA = 200;
export function parseDeviceDailyQuota(value: string) {
  if (!/^\d+$/.test(value.trim())) return null;
  const quota = Number(value);
  return Number.isInteger(quota) && quota >= 1 && quota <= 100000 ? quota : null;
}
export function deviceDailyQuota(policy: { dailyLimit: number; useGlobalQuota: boolean }, globalQuota: number) {
  return policy.useGlobalQuota ? globalQuota : policy.dailyLimit;
}
