export const AUTO_REPLY_MAX_AGE_KEY = "auto-reply-max-age-seconds";
export const AUTO_REPLY_MAX_AGE_LABEL = "Batas usia pesan untuk auto-reply (detik)";
export const DEFAULT_AUTO_REPLY_MAX_AGE_SECONDS = 0;
export const MAX_AUTO_REPLY_AGE_SECONDS = 86400;
export const AUTO_REPLY_AGE_ERROR = "Masukkan bilangan bulat 0–86400 detik. Nilai 0 menonaktifkan batas usia auto-reply.";

export function parseAutoReplyMaxAge(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const seconds = Number(value);
  return Number.isSafeInteger(seconds) && seconds >= 0 && seconds <= MAX_AUTO_REPLY_AGE_SECONDS ? seconds : null;
}

/** Timestamp is WhatsApp Unix seconds (number or protobuf Long). Use event arrival, not processing time. */
export function autoReplyAgeAllowed(timestamp: unknown, maximumSeconds: number, receivedAt: number) {
  if (maximumSeconds === 0) return true;
  if (!Number.isInteger(maximumSeconds) || maximumSeconds < 0 || maximumSeconds > MAX_AUTO_REPLY_AGE_SECONDS) return false;
  let seconds: number;
  try { seconds = Number(timestamp); } catch { return false; }
  if (!Number.isSafeInteger(seconds) || seconds <= 0 || !Number.isFinite(receivedAt)) return false;
  const ageMs = receivedAt - seconds * 1000;
  // Permit minor clock skew, but do not let an implausible future timestamp bypass an enabled limit.
  return ageMs >= -60_000 && ageMs <= maximumSeconds * 1000;
}
