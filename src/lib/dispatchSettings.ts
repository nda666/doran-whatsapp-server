export const DISPATCH_MAX_AGE_DAYS_KEY = "dispatch-max-age-days";
export const DEFAULT_DISPATCH_MAX_AGE_DAYS = 1;
export const MAX_DISPATCH_MAX_AGE_DAYS = 3650;
export const DISPATCH_MAX_AGE_LABEL = "Maksimal usia data antrean (hari)";
export const DISPATCH_DELAY_KEY = "dispatch-random-delay";
export const DISPATCH_DELAY_LABEL = "Jeda acak pengiriman (detik)";
export const DEFAULT_DISPATCH_DELAY = { minSeconds: 2, maxSeconds: 5 };
export const MAX_DISPATCH_DELAY_SECONDS = 30;
export type DispatchDelayRange = typeof DEFAULT_DISPATCH_DELAY;
export function parseDispatchDelayRange(value: string): DispatchDelayRange | null {
  try {
    const range = JSON.parse(value);
    if (!range || typeof range !== "object" || Array.isArray(range) || Object.keys(range).some(key => !["minSeconds", "maxSeconds"].includes(key))) return null;
    const { minSeconds, maxSeconds } = range;
    return Number.isInteger(minSeconds) && Number.isInteger(maxSeconds) && minSeconds >= 1 && maxSeconds >= minSeconds && maxSeconds <= MAX_DISPATCH_DELAY_SECONDS ? { minSeconds, maxSeconds } : null;
  } catch { return null; }
}

export const DISPATCH_QUEUE_ORDER_KEY = "dispatch-queue-order";
export const DISPATCH_QUEUE_ORDER_LABEL = "Urutan pemrosesan antrean";
export const DEFAULT_DISPATCH_QUEUE_ORDER = "oldest";
export const DISPATCH_QUEUE_ORDER_OPTIONS = [
  { value: "oldest", label: "Data terlama dahulu" },
  { value: "newest", label: "Data terbaru dahulu" },
];
export type DispatchQueueOrder = "oldest" | "newest";
export function parseDispatchQueueOrder(value: string): DispatchQueueOrder | null {
  return value === "oldest" || value === "newest" ? value : null;
}
export function dispatchQueueOrderBy(order: DispatchQueueOrder) {
  const direction = order === "newest" ? "desc" as const : "asc" as const;
  return [{ createdAt: direction }, { id: direction }];
}

export function parseDispatchMaxAgeDays(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const days = Number(value);
  return Number.isInteger(days) && days >= 1 && days <= MAX_DISPATCH_MAX_AGE_DAYS ? days : null;
}

export function dispatchAgeCutoff(days: number, now = Date.now()) {
  return new Date(now - days * 86_400_000);
}
