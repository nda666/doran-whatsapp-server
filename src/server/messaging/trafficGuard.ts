import { createHash, randomInt, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { SendGuardError } from "./safety";

// Optional audit implementation. No existing send path imports/enables this module.
export type TrafficPolicy = { maxPerMinute: number; identicalPerHour: number };
export type TrafficContext = { logicalId: string; contentHash: string };
export type TrafficSnapshot = {
  minuteAttempts: number;
  oldestMinuteAt: number | null;
  sameContent: Array<{ logicalId: string; lastAt: number }>;
  connectedAt: number | null;
};
export type TrafficDecision = { retryAt: number | null; reason: string | null; minimumIntervalMs: number };

export function configuredTrafficPolicy(env: NodeJS.ProcessEnv = process.env): TrafficPolicy | null {
  if (env.WA_TRAFFIC_GUARD_ENABLED !== "true") return null;
  const read = (name: string, fallback: number, min: number, max: number) => {
    const value = env[name] === undefined ? fallback : Number(env[name]);
    if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid ${name}`);
    return value;
  };
  return { maxPerMinute: read("WA_MAX_PER_MINUTE", 15, 8, 15), identicalPerHour: read("WA_IDENTICAL_PER_HOUR", 4, 3, 5) };
}

/** Hash content without retaining text or expanding binary attachments into JSON arrays. */
export function trafficContentHash(content: unknown): string {
  const active = new Set<object>();
  const encode = (value: unknown): string => {
    if (value === undefined) return "undefined";
    if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
    if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
    if (typeof value === "bigint") return `bigint:${value}`;
    if (value instanceof Uint8Array) return `bytes:${value.byteLength}:${createHash("sha256").update(value).digest("hex")}`;
    if (value instanceof Date) return `date:${value.toISOString()}`;
    if (value instanceof URL) return `url:${value.href}`;
    if (typeof value !== "object") throw new Error("WA_TRAFFIC_FINGERPRINT_UNSUPPORTED");
    if (typeof (value as any).pipe === "function" || typeof (value as any).read === "function") throw new Error("WA_TRAFFIC_STREAM_NEEDS_IMMUTABLE_CONTENT_HASH");
    if (active.has(value)) throw new Error("WA_TRAFFIC_FINGERPRINT_CYCLE");
    active.add(value);
    try {
      return Array.isArray(value) ? `[${value.map(encode).join(",")}]`
        : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${encode((value as Record<string, unknown>)[key])}`).join(",")}}`;
    } finally { active.delete(value); }
  };
  return createHash("sha256").update(encode(content)).digest("hex");
}

/** Internal traffic budget; these figures are not published WhatsApp safety limits. */
export function evaluateTraffic(policy: TrafficPolicy, snapshot: TrafficSnapshot, logicalId: string, now: number, jitterMs: number): TrafficDecision {
  if (!Number.isInteger(policy.maxPerMinute) || policy.maxPerMinute < 8 || policy.maxPerMinute > 15 ||
      !Number.isInteger(policy.identicalPerHour) || policy.identicalPerHour < 3 || policy.identicalPerHour > 5 ||
      !Number.isInteger(jitterMs) || jitterMs < 1200 || jitterMs > 3000) throw new Error("WA_TRAFFIC_POLICY_INVALID");
  const age = snapshot.connectedAt === null ? Infinity : Math.max(0, now - snapshot.connectedAt);
  const cap = Math.min(policy.maxPerMinute, age < 60_000 ? 5 : age < 120_000 ? 10 : policy.maxPerMinute);
  const decision = { retryAt: null as number | null, reason: null as string | null,
    minimumIntervalMs: Math.ceil(60_000 / cap) + jitterMs };
  if (age < 30_000) return { ...decision, retryAt: Math.max(now + 1, snapshot.connectedAt! + 30_000), reason: "RECONNECT_COOLDOWN" };
  const waits: Array<{ retryAt: number; reason: string }> = [];
  if (snapshot.minuteAttempts >= cap) {
    if (snapshot.oldestMinuteAt === null) throw new Error("WA_TRAFFIC_SNAPSHOT_INVALID");
    waits.push({ retryAt: Math.max(now + 1, snapshot.oldestMinuteAt + 60_000), reason: "MINUTE_LIMIT" });
  }
  if (!snapshot.sameContent.some(row => row.logicalId === logicalId) && snapshot.sameContent.length >= policy.identicalPerHour) {
    waits.push({ retryAt: Math.max(now + 1, Math.min(...snapshot.sameContent.map(row => row.lastAt)) + 3600000), reason: "IDENTICAL_HOURLY_LIMIT" });
  }
  const blocked = waits.sort((a, b) => b.retryAt - a.retryAt)[0];
  return blocked ? { ...decision, ...blocked } : decision;
}

/** Call inside reserveSend's transaction; its existing device row is the mutex. */
export async function reserveTraffic(tx: Prisma.TransactionClient, phoneId: string, context: TrafficContext, policy: TrafficPolicy, now = new Date()) {
  if (!context.logicalId || context.logicalId.length > 128 || !/^[a-f0-9]{64}$/.test(context.contentHash)) throw new Error("WA_TRAFFIC_CONTEXT_INVALID");
  const locked = await tx.$queryRaw<Array<{ phoneId: string }>>`SELECT phoneId FROM device_send_policies WHERE phoneId = ${phoneId} FOR UPDATE`;
  if (locked.length !== 1) throw new Error("WA_TRAFFIC_POLICY_MISSING");
  const [minute] = await tx.$queryRaw<Array<{ total: bigint; oldest: Date | null }>>`
    SELECT COUNT(*) AS total, MIN(admittedAt) AS oldest FROM wa_send_traffic
    WHERE phoneId = ${phoneId} AND admittedAt > ${new Date(now.getTime() - 60_000)}`;
  const repeated = await tx.$queryRaw<Array<{ logicalId: string; lastAt: Date }>>`
    SELECT logicalId, MAX(admittedAt) AS lastAt FROM wa_send_traffic
    WHERE phoneId = ${phoneId} AND contentHash = ${context.contentHash} AND admittedAt > ${new Date(now.getTime() - 3600000)}
    GROUP BY logicalId`;
  const recovery = await tx.$queryRaw<Array<{ connectedAt: Date }>>`SELECT connectedAt FROM wa_send_recovery WHERE phoneId = ${phoneId}`;
  const decision = evaluateTraffic(policy, { minuteAttempts: Number(minute.total), oldestMinuteAt: minute.oldest?.getTime() ?? null,
    sameContent: repeated.map(row => ({ logicalId: row.logicalId, lastAt: row.lastAt.getTime() })), connectedAt: recovery[0]?.connectedAt.getTime() ?? null },
    context.logicalId, now.getTime(), randomInt(1200, 3001));
  if (decision.retryAt !== null) throw new SendGuardError("DEVICE_THROTTLED", new Date(decision.retryAt));
  await tx.$executeRaw`INSERT INTO wa_send_traffic (id, phoneId, logicalId, contentHash, admittedAt)
    VALUES (${randomUUID()}, ${phoneId}, ${context.logicalId}, ${context.contentHash}, ${now})`;
  // Retries consume rate budget; stable logical IDs do not count as new identical messages.
  return decision.minimumIntervalMs;
}

export async function recordTrafficReconnect(phoneId: string) {
  if (!configuredTrafficPolicy()) return;
  await prisma.$transaction(async tx => {
    await tx.deviceSendPolicy.createMany({ data: [{ phoneId }], skipDuplicates: true });
    await tx.$queryRaw`SELECT phoneId FROM device_send_policies WHERE phoneId = ${phoneId} FOR UPDATE`;
    const now = new Date(), readyAt = new Date(now.getTime() + 30_000);
    await tx.$executeRaw`INSERT INTO wa_send_recovery (phoneId, connectedAt) VALUES (${phoneId}, ${now})
      ON DUPLICATE KEY UPDATE connectedAt = VALUES(connectedAt)`;
    await tx.deviceSendPolicy.updateMany({ where: { phoneId, nextAllowedAt: { lt: readyAt } }, data: { nextAllowedAt: readyAt } });
  });
}

// Cleanup metadata only; no message bodies, auth keys or business queue rows are stored here.
export async function pruneTrafficLedger(now = new Date()) {
  if (!configuredTrafficPolicy()) return;
  for (let batch = 0; batch < 100; batch++) {
    const count = await prisma.$executeRaw`DELETE FROM wa_send_traffic WHERE admittedAt <= ${new Date(now.getTime() - 2 * 3600000)} LIMIT 10000`;
    if (count < 10000) break;
  }
}

type SerialState = { tail: Promise<void>; pending: number };
const shared = globalThis as typeof globalThis & { doranPhysicalSendQueue?: Map<string, SerialState> };
const serial = shared.doranPhysicalSendQueue || (shared.doranPhysicalSendQueue = new Map());

/** Keep the lock until the real transport promise settles, including after caller timeout. */
export function serializePhoneSend<T>(phoneId: string, task: () => Promise<T>, maximumPending = 20): Promise<T> {
  const state = serial.get(phoneId) || { tail: Promise.resolve(), pending: 0 };
  if (state.pending >= maximumPending) return Promise.reject(new SendGuardError("DEVICE_THROTTLED", new Date(Date.now() + 1000)));
  serial.set(phoneId, state); state.pending++;
  const running = state.tail.then(task);
  state.tail = running.then(() => undefined, () => undefined);
  return running.finally(() => { if (--state.pending === 0 && serial.get(phoneId) === state) serial.delete(phoneId); });
}

export function sevenDayWarmupLimit(start: Date | null, maximum: number, now = Date.now()) {
  if (!start) return maximum;
  const day = Math.max(0, Math.floor((now - start.getTime()) / 86400000));
  return day < 7 ? Math.min(maximum, Math.round(20 * 1.8 ** day)) : maximum;
}
