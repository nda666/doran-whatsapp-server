import { z } from "zod";

export const OPERATING_HOURS_KEY = "dispatch-operating-hours";
export const OPERATING_HOURS_LABEL = "Jam operasional pengiriman (WIB)";
export const OPERATING_HOURS_ERROR = "Gunakan jam HH:mm (00:00–23:59). Jam mulai dan selesai harus berbeda jika pembatasan aktif.";
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const operatingHoursInput = z.object({ enabled: z.boolean(), start: time, end: time }).strict()
  .refine(value => !value.enabled || value.start !== value.end, OPERATING_HOURS_ERROR);
export type OperatingHours = z.infer<typeof operatingHoursInput>;
export const DEFAULT_OPERATING_HOURS: OperatingHours = { enabled: false, start: "08:00", end: "20:00" };

export function parseOperatingHours(value: unknown): OperatingHours | null {
  try {
    const result = operatingHoursInput.safeParse(typeof value === "string" ? JSON.parse(value) : value);
    return result.success ? result.data : null;
  } catch { return null; }
}

export function effectiveOperatingHours(global: OperatingHours, custom?: unknown): OperatingHours {
  if (custom == null) return global;
  const hours = parseOperatingHours(custom);
  if (!hours) throw new Error("Invalid device operating hours");
  return hours;
}

/** Daily in WIB, independent of host timezone. Start inclusive, end exclusive. */
export function operatingHoursState(hours: OperatingHours, now = new Date()) {
  if (!hours.enabled) return { open: true, nextOpenAt: null };
  const minutes = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3));
  const start = minutes(hours.start), end = minutes(hours.end);
  const shifted = now.getTime() + 7 * 3600000;
  const minute = new Date(shifted).getUTCHours() * 60 + new Date(shifted).getUTCMinutes();
  const open = start < end ? minute >= start && minute < end : minute >= start || minute < end;
  if (open) return { open: true, nextOpenAt: null };
  const day = Math.floor(shifted / 86400000) * 86400000 - 7 * 3600000;
  return { open: false, nextOpenAt: new Date(day + start * 60000 + (minute >= start ? 86400000 : 0)) };
}

export function operatingHoursLabel(hours: OperatingHours) {
  return hours.enabled ? `${hours.start}–${hours.end} WIB${hours.start > hours.end ? " (lewat tengah malam)" : ""}` : "24 jam";
}
