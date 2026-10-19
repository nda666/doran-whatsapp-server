import type { DispatchDelayRange } from "./dispatchSettings";

type IntervalPolicy = { minIntervalSeconds?: number | null; maxIntervalSeconds?: number | null };

export function deviceSendIntervalRange(global: DispatchDelayRange, policy?: IntervalPolicy): DispatchDelayRange {
  if (policy?.minIntervalSeconds == null) return global;
  if (policy.maxIntervalSeconds != null) {
    return { minSeconds: policy.minIntervalSeconds, maxSeconds: policy.maxIntervalSeconds };
  }
  // Policies saved before ranges existed retain their minimum floor until edited.
  return {
    minSeconds: Math.max(global.minSeconds, policy.minIntervalSeconds),
    maxSeconds: Math.max(global.maxSeconds, policy.minIntervalSeconds),
  };
}
