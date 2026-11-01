import { dispatchErrorLabels } from "../../lib/dispatchPresentation";

// Kept apart from safety.ts so the traffic guard can throw it without a circular import.
export class SendGuardError extends Error {
  constructor(public code: string, public retryAt?: Date) { super(dispatchErrorLabels[code] || code); }
}
