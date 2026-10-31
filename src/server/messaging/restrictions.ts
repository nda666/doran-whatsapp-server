import type { ReachoutTimelockState, WASocket } from "@whiskeysockets/baileys";
import { prisma } from "../../lib/prisma";
import { SendGuardError } from "./safety";

const checks = new WeakMap<WASocket, Promise<void>>();
const verified = new WeakMap<WASocket, number>();
const writes = new Map<string, Promise<void>>();
const versions = new Map<string, number>();
export function recordRestriction(phoneId: string, state: ReachoutTimelockState) {
  // Missing isActive is unknown, never evidence that an existing lock was lifted.
  if (typeof state.isActive !== "boolean") return Promise.resolve();
  versions.set(phoneId, (versions.get(phoneId) || 0) + 1);
  const endsAt = state.isActive && state.timeEnforcementEnds && Number.isFinite(new Date(state.timeEnforcementEnds).getTime()) ? new Date(state.timeEnforcementEnds) : null;
  const data = { active: state.isActive, reason: state.enforcementType || null, endsAt, checkedAt: new Date() };
  const write = (writes.get(phoneId) || Promise.resolve()).catch(() => {}).then(async () => {
    await prisma.waRestriction.upsert({ where: { phoneId }, create: { phoneId, ...data }, update: data });
  });
  writes.set(phoneId, write);
  return write;
}
export function refreshRestrictions(phoneId: string, socket: WASocket) {
  const pending = checks.get(socket);
  if (pending) return pending;
  const check = (async () => {
    const version = versions.get(phoneId) || 0;
    const state = await socket.fetchAccountReachoutTimelock();
    if (typeof state.isActive !== "boolean") throw new Error("WA_RESTRICTION_STATE_UNKNOWN");
    if ((versions.get(phoneId) || 0) === version) await recordRestriction(phoneId, state);
    else await writes.get(phoneId);
    verified.set(socket, Date.now());
    // Capacity information is diagnostic; its absence must not invent a limit.
    try {
      const cap = await socket.fetchNewChatMessageCap();
      if (cap && typeof cap === "object") await prisma.waRestriction.update({ where: { phoneId }, data: { newChatCap: JSON.parse(JSON.stringify(cap)) } });
    } catch { console.error("WA_CHAT_CAP_QUERY_FAILED", phoneId); }
  })().finally(() => checks.delete(socket));
  checks.set(socket, check);
  return check;
}
export async function requireUnrestricted(phoneId: string, socket: WASocket) {
  if (!verified.has(socket) || Date.now() - verified.get(socket)! > 300_000) {
    try { await refreshRestrictions(phoneId, socket); }
    catch { throw new SendGuardError("WA_RESTRICTION_UNKNOWN", new Date(Date.now() + 60_000)); }
  }
  try { await writes.get(phoneId); }
  catch { throw new SendGuardError("WA_RESTRICTION_UNKNOWN", new Date(Date.now() + 60_000)); }
  const state = await prisma.waRestriction.findUnique({ where: { phoneId } });
  if (state?.active) throw new SendGuardError("WA_ACCOUNT_RESTRICTED", new Date(Math.max(Date.now() + 60_000, state.endsAt?.getTime() || 0)));
}
