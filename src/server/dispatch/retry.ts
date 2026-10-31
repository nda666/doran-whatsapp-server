// Preserve the WhatsApp message ID while retrying so late receipts still match.
export const ACK_TIMEOUT_MS = 40_000;
export const ACK_RETRY_ERROR = "ACK_TIMEOUT_RETRY";
export const ACK_EXHAUSTED_ERROR = "ACK_TIMEOUT_RETRY_EXHAUSTED";
export const retryEligible = () => ({ OR: [
  { messageId: null },
  { lastError: { in: [ACK_RETRY_ERROR, "MEDIA_PREPARATION_FAILED", "DEVICE_DAILY_LIMIT", "DEVICE_THROTTLED", "DEVICE_SAFETY_PAUSED", "OUTSIDE_OPERATING_HOURS", "TELEGRAM_FLOOD_RETRY", "TELEGRAM_DISABLED", "DEVICE_INACTIVE", "WA_ACCOUNT_RESTRICTED", "WA_RESTRICTION_UNKNOWN"] } },
] });

export function acknowledgementFailure(error: unknown, attempts: number, now = Date.now()) {
  if (error instanceof Error && error.message === "WA_ACK_463") {
    return { status: "FAILED" as const, lastError: "WA_ACK_463_ACCOUNT_RESTRICTED" };
  }
  if (!(error instanceof Error) || !["SEND_TIMEOUT", "ACK_TIMEOUT"].includes(error.message)) {
    return { status: "UNCERTAIN" as const, lastError: "ACK_UNKNOWN_CHECK_RECIPIENT" };
  }
  return attempts >= 5
    ? { status: "FAILED" as const, lastError: ACK_EXHAUSTED_ERROR }
    : { status: "QUEUED" as const, lastError: ACK_RETRY_ERROR,
      nextAttemptAt: new Date(now + 30_000 * 2 ** attempts) };
}
