export const WARMUP_DAILY_LIMITS_KEY = "warmup-daily-limits";
export const WARMUP_DAILY_LIMITS_LABEL = "Batas percobaan pemanasan per hari";
export const DEFAULT_WARMUP_DAILY_LIMITS = [25, 50, 100, 200, 350, 500];
export const WARMUP_LIMITS_ERROR = "Masukkan bilangan bulat 1–100000 dipisahkan koma, dengan urutan meningkat. Contoh: 25,50,100,200,350,500.";

export function parseWarmupDailyLimits(value: string): number[] | null {
  if (!value.trim() || value.length > 16000) return null;
  const parts = value.split(",").map(part => part.trim());
  if (parts.some(part => !/^\d+$/.test(part))) return null;
  const limits = parts.map(Number);
  return limits.every((limit, index) => Number.isSafeInteger(limit) && limit >= 1 && limit <= 100000 && (index === 0 || limit > limits[index - 1])) ? limits : null;
}
