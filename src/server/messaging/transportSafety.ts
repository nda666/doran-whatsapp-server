import { AsyncLocalStorage } from "node:async_hooks";
import { generateMessageIDV2 } from "@whiskeysockets/baileys";
import { SendGuardError } from "./safety";

type SerialState = { tail: Promise<void>; pending: number };
export type LegacySendAttempt = { messageId: string; transportStarted: boolean };
const shared = globalThis as typeof globalThis & {
  doranTransportQueue?: Map<string, SerialState>;
  doranLegacyAttempt?: AsyncLocalStorage<LegacySendAttempt>;
};
const queues = shared.doranTransportQueue || (shared.doranTransportQueue = new Map());
const attempts = shared.doranLegacyAttempt || (shared.doranLegacyAttempt = new AsyncLocalStorage<LegacySendAttempt>());

// The real send promise owns this lock, even when its caller has timed out.
export function serializeTransport<T>(phoneId: string, task: () => Promise<T>, maximumPending = 20): Promise<T> {
  const state = queues.get(phoneId) || { tail: Promise.resolve(), pending: 0 };
  if (state.pending >= maximumPending) return Promise.reject(new SendGuardError("DEVICE_THROTTLED", new Date(Date.now() + 60_000)));
  queues.set(phoneId, state); state.pending++;
  const running = state.tail.then(task);
  state.tail = running.then(() => undefined, () => undefined);
  return running.finally(() => { if (--state.pending === 0 && queues.get(phoneId) === state) queues.delete(phoneId); });
}

export const createLegacySendAttempt = (): LegacySendAttempt => ({ messageId: generateMessageIDV2(), transportStarted: false });
export const withLegacySendAttempt = <T>(attempt: LegacySendAttempt, task: () => Promise<T>) => attempts.run(attempt, task);
export function markLegacyTransportStarted() {
  const attempt = attempts.getStore();
  if (attempt) attempt.transportStarted = true;
}

// A 428 after native send starts has an ambiguous outcome, so never resend it blindly.
export const canRetryLegacySend = (attempt: LegacySendAttempt, error: any, retry: number, maximumRetries: number) =>
  !attempt.transportStarted && error?.output?.statusCode === 428 && retry < maximumRetries;
