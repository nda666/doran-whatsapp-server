import { dispatchErrorLabels } from "../../lib/dispatchPresentation";

// Next.js and the custom server compile separate copies of this module in one
// process. A shared symbol identifies our pre-transport errors across bundles.
const guardBrand = Symbol.for("doran.send-guard-error.v1");
const guardCodes = new Set([
  "ACCOUNT_INACTIVE", "DEVICE_INACTIVE", "DEVICE_DAILY_LIMIT", "DEVICE_THROTTLED",
  "DEVICE_SAFETY_PAUSED", "OUTSIDE_OPERATING_HOURS", "RECIPIENT_OPTED_OUT",
  "RECIPIENT_ID_UNRESOLVED", "SENDER_NUMBER_MISMATCH", "TELEGRAM_DISABLED",
  "WA_ACCOUNT_RESTRICTED", "WA_RESTRICTION_UNKNOWN",
]);

// Kept apart from safety.ts so the traffic guard can throw it without a circular import.
export class SendGuardError extends Error {
  readonly [guardBrand] = true;
  constructor(public code: string, public retryAt?: Date) { super(dispatchErrorLabels[code] || code); }
}

export function isSendGuardError(error: unknown): error is SendGuardError {
  if (!(error instanceof Error)) return false;
  const guard = error as SendGuardError;
  return guard[guardBrand] === true && guardCodes.has(guard.code) &&
    (guard.retryAt === undefined || (guard.retryAt instanceof Date && Number.isFinite(guard.retryAt.getTime())));
}
