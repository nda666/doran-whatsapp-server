export const TRAFFIC_GUARD_KEY = "wa-traffic-guard";
export const TRAFFIC_GUARD_LABEL = "Pembatas lalu lintas pengiriman WhatsApp";
export const TRAFFIC_GUARD_ERROR = "Isi semua angka dengan bilangan bulat dalam rentang yang diizinkan; jeda acak maksimum harus sama atau lebih besar dari minimum, dan batas menit awal tidak boleh melebihi menit kedua maupun batas per menit.";

export type TrafficPolicy = {
  enabled: boolean;
  maxPerMinute: number;
  identicalPerHour: number;
  jitterMinMs: number;
  jitterMaxMs: number;
  reconnectCooldownSeconds: number;
  rampFirstMinute: number;
  rampSecondMinute: number;
  /** Messages one recipient may receive in 24 hours from all of an account's numbers combined. */
  recipientPerDay: number;
  /** Proactive API/campaign messages need an active recipient consent record. */
  requireConsent: boolean;
};

// Internal budgets, not published WhatsApp limits. Active unless an administrator turns it off.
export const DEFAULT_TRAFFIC_POLICY: TrafficPolicy = {
  enabled: true, maxPerMinute: 8, identicalPerHour: 4, jitterMinMs: 1500, jitterMaxMs: 4000,
  reconnectCooldownSeconds: 60, rampFirstMinute: 3, rampSecondMinute: 6,
  recipientPerDay: 10, requireConsent: false,
};

export const TRAFFIC_POLICY_LIMITS = {
  maxPerMinute: [1, 60], identicalPerHour: [1, 100], jitterMinMs: [0, 60000], jitterMaxMs: [0, 60000],
  reconnectCooldownSeconds: [0, 600], rampFirstMinute: [1, 60], rampSecondMinute: [1, 60], recipientPerDay: [1, 1000],
} as const;

export function validTrafficPolicy(policy: TrafficPolicy) {
  if (typeof policy.enabled !== "boolean" || typeof policy.requireConsent !== "boolean") return false;
  for (const [name, [min, max]] of Object.entries(TRAFFIC_POLICY_LIMITS)) {
    const value = policy[name as keyof typeof TRAFFIC_POLICY_LIMITS];
    if (!Number.isInteger(value) || value < min || value > max) return false;
  }
  return policy.jitterMaxMs >= policy.jitterMinMs && policy.rampFirstMinute <= policy.rampSecondMinute && policy.rampFirstMinute <= policy.maxPerMinute;
}

/** Missing fields fall back to the defaults so an older stored value keeps working. */
export function parseTrafficPolicy(value: string): TrafficPolicy | null {
  if (!value.trim() || value.length > 4000) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { return null; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const policy = { ...DEFAULT_TRAFFIC_POLICY, ...(parsed as Partial<TrafficPolicy>) };
  return validTrafficPolicy(policy) ? policy : null;
}
