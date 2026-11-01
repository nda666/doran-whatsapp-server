// Pure helpers for per-hour send tracking; kept free of imports so the transport boundary can use them cheaply.
const WIB_MS = 7 * 3_600_000;
/** WIB hour (0–23) of an instant; daily usage days are also counted in WIB. */
export const wibHour = (at: Date) => new Date(at.getTime() + WIB_MS).getUTCHours();
export type SendHours = Record<string, number>;

export function addSendHour(current: unknown, hour: number): SendHours {
  const hours: SendHours = current && typeof current === "object" && !Array.isArray(current) ? { ...(current as SendHours) } : {};
  hours[String(hour)] = (Number(hours[String(hour)]) || 0) + 1;
  return hours;
}

/** Reply rate needs enough volume to mean anything; sends in the quiet window (21:00–06:59 WIB) are reported as a share. */
export function engagementSummary(attempts: number, replies: number, sendHours: unknown) {
  const hours = sendHours && typeof sendHours === "object" && !Array.isArray(sendHours) ? sendHours as SendHours : {};
  let total = 0, quiet = 0;
  for (const [hour, count] of Object.entries(hours)) {
    const value = Number(count) || 0, h = Number(hour);
    total += value;
    if (h >= 21 || h < 7) quiet += value;
  }
  return {
    replies, replyRate: attempts >= 20 ? Math.min(1, replies / attempts) : null,
    quietHourShare: total >= 20 ? quiet / total : null, sendHours: hours,
  };
}

