import { z } from "zod";

export const QUOTA_RESET_KEY = "device-quota-reset";
export const QUOTA_RESET_LABEL = "Waktu reset kuota pengiriman";
export const quotaResetInput = z.object({
  mode: z.enum(["midnight", "after-full"]),
  hours: z.number().int().min(1).max(168),
}).strict();
export type QuotaReset = z.infer<typeof quotaResetInput>;
export const DEFAULT_QUOTA_RESET: QuotaReset = { mode: "midnight", hours: 24 };
export function effectiveQuotaReset(global: QuotaReset, override?: unknown): QuotaReset {
  if (override == null) return global;
  const parsed = quotaResetInput.safeParse(override);
  if (!parsed.success) throw new Error("Invalid device quota reset setting");
  return parsed.data;
}
export function parseQuotaReset(value: string): QuotaReset | null {
  try { const result = quotaResetInput.safeParse(JSON.parse(value)); return result.success ? result.data : null; }
  catch { return null; }
}
export const quotaUsageDay = (now = new Date()) => new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10);
type Window = { attempts: number; startedAt: Date; lastAttemptAt: Date; reachedAt: Date | null };

// Compare against the next WIB midnight at the moment quota became full.
// The seven-hour threshold is fixed; the configured delay remains adjustable.
export function fullQuotaResetAt(reachedAt: Date, hours: number) {
  const midnight = new Date(`${quotaUsageDay(reachedAt)}T17:00:00Z`);
  return midnight.getTime() - reachedAt.getTime() > 7 * 3600000
    ? midnight
    : new Date(reachedAt.getTime() + hours * 3600000);
}

// Daily transport statistics remain separate from the quota cycle.
export function quotaWindowState(window: Window | null | undefined, dailyAttempts: number, limit: number, setting: QuotaReset, now = new Date()) {
  if (setting.mode === "midnight") {
    const sameDay = window && quotaUsageDay(window.startedAt) === quotaUsageDay(now);
    return { used: dailyAttempts, startedAt: sameDay ? window.startedAt : now,
      reachedAt: sameDay ? window.reachedAt : null, resetAt: new Date(`${quotaUsageDay(now)}T17:00:00Z`) };
  }
  const used = window?.attempts ?? dailyAttempts;
  const reachedAt = window?.reachedAt ?? (used >= limit ? window?.lastAttemptAt ?? now : null);
  const resetAt = reachedAt ? fullQuotaResetAt(reachedAt, setting.hours) : null;
  const expired = resetAt !== null && resetAt <= now;
  return { used: expired ? 0 : used, startedAt: expired ? now : window?.startedAt ?? now,
    reachedAt: expired ? null : reachedAt, resetAt: expired ? null : resetAt };
}
