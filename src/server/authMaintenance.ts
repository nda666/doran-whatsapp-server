import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { maintainDatabaseAuth, readDatabaseCreds } from "./libs/waAuthState";
import { pruneAuthTokens } from "./libs/authKeyMaintenance";
import { phoneMaintenance } from "./libs/phoneMaintenance";

type Checkpoint = { cursor: string; indexOffset: number; sampledAt?: number; keys?: number };
type Ledger = { next: number; phones: Record<string, Checkpoint> };
const shared = globalThis as typeof globalThis & { doranAuthMaintenance?: {
  startedAt: number; running: boolean; lastSuccessAt: number; lastError?: string; failures: number; removed: number; compacted: number; legacyFiles: number;
  sampledDevices: number; largeStores: Array<{ phoneId: string; keys: number }>;
} };
const health = shared.doranAuthMaintenance || (shared.doranAuthMaintenance = { startedAt: 0, running: false, lastSuccessAt: 0, failures: 0, removed: 0, compacted: 0, legacyFiles: 0, sampledDevices: 0, largeStores: [] });
export const authMaintenanceHealth = () => ({ ...health, healthy: health.failures < 3 && (!health.startedAt || Date.now() - (health.lastSuccessAt || health.startedAt) < 600000) });
const stateDirectory = path.resolve("storage/auth-maintenance");
const validId = /^[a-zA-Z0-9_-]+$/;

export async function loadAuthMaintenanceState(directory = stateDirectory): Promise<Ledger> {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  if ((await fs.lstat(directory)).isSymbolicLink()) throw new Error("AUTH_MAINTENANCE_UNSAFE_STATE");
  const filename = path.join(directory, "checkpoints.json");
  try {
    const stat = await fs.lstat(filename);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2 * 1024 * 1024) throw new Error("AUTH_MAINTENANCE_UNSAFE_STATE");
    const saved = JSON.parse(await fs.readFile(filename, "utf8")), phones: Record<string, Checkpoint> = Object.create(null);
    for (const [id, row] of Object.entries(saved.phones || {}).slice(0, 10000)) {
      const value = row as Checkpoint;
      if (validId.test(id) && value && (value.cursor === "" || /^[a-f0-9]{64}$/.test(value.cursor)) && Number.isSafeInteger(value.indexOffset) && value.indexOffset >= 0) phones[id] = value;
    }
    return { next: Number.isSafeInteger(saved.next) && saved.next >= 0 ? saved.next : 0, phones };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return { next: 0, phones: Object.create(null) };
  }
}

export async function saveAuthMaintenanceState(ledger: Ledger, directory = stateDirectory) {
  if ((await fs.lstat(directory)).isSymbolicLink()) throw new Error("AUTH_MAINTENANCE_UNSAFE_STATE");
  const temporary = path.join(directory, `${randomUUID()}.tmp`);
  try { await fs.writeFile(temporary, JSON.stringify(ledger), { flag: "wx", mode: 0o600 }); await fs.rename(temporary, path.join(directory, "checkpoints.json")); }
  finally { await fs.unlink(temporary).catch(() => {}); }
}

// Only committed, encrypted DB migrations, with a 24h grace. Never recurse,
// follow symlinks, or touch backup/media directories or a newer legacy writer.
export async function pruneMigratedAuthFiles(phone: { id: string; userId: string }) {
  if (!validId.test(phone.id) || !validId.test(phone.userId)) return 0;
  const migrated = await prisma.waAuthSession.findUnique({ where: { phoneId: phone.id } });
  if (!migrated?.migratedAt || migrated.migratedAt.getTime() === 0) return 0;
  const saved = await readDatabaseCreds(phone.id);
  if (!saved.migrated || !saved.creds) return 0;
  const root = path.resolve(process.env.WHATSAPP_AUTH_FOLDER || "./storage/whatsapp-auth"), target = path.resolve(root, `${phone.userId}-${phone.id}`);
  if (path.dirname(target) !== root) throw new Error("AUTH_MAINTENANCE_UNSAFE_FOLDER");
  let removed = 0;
  try {
    const stat = await fs.lstat(target);
    if (!stat.isDirectory() || stat.isSymbolicLink() || path.dirname(await fs.realpath(target)) !== await fs.realpath(root)) throw new Error("AUTH_MAINTENANCE_UNSAFE_FOLDER");
    const entries = await fs.opendir(target);
    for await (const entry of entries) {
      if (removed >= 100) break;
      if (!entry.isFile() || !entry.name.endsWith(".json") || entry.name === "creds.json") continue;
      const filename = path.join(target, entry.name), info = await fs.lstat(filename);
      if (!info.isFile() || info.isSymbolicLink() || info.mtimeMs > migrated.migratedAt.getTime() || info.mtimeMs > Date.now() - 86400000) continue;
      await fs.unlink(filename); removed++;
    }
    if (removed >= 100) return removed;
    const remaining: string[] = [];
    for await (const entry of await fs.opendir(target)) { remaining.push(entry.name); if (remaining.length > 1) break; }
    if (!remaining.length) await fs.rmdir(target);
    else if (remaining.length === 1 && remaining[0] === "creds.json") {
      const file = path.join(target, "creds.json"), info = await fs.lstat(file);
      if (info.isFile() && !info.isSymbolicLink() && info.mtimeMs <= migrated.migratedAt.getTime() && info.mtimeMs <= Date.now() - 86400000) { await fs.unlink(file); removed++; await fs.rmdir(target); }
    }
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  return removed;
}

export async function pruneUnownedAuthBatch(phoneId: string) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT phoneId FROM wa_auth_sessions WHERE phoneId = ${phoneId} FOR UPDATE`;
    const auth = await tx.waAuthSession.findUnique({ where: { phoneId } });
    if (!auth || auth.leaseUntil && auth.leaseUntil > new Date()) return 0;
    await tx.$queryRaw`SELECT id FROM phones WHERE id = ${phoneId} FOR UPDATE`;
    const phone = await tx.phone.findUnique({ where: { id: phoneId }, select: { active: true } });
    if (phone && auth.migratedAt?.getTime() !== 0) return 0;
    await tx.$queryRaw`SELECT phoneId FROM wa_sender_leases WHERE phoneId = ${phoneId} FOR UPDATE`;
    const sending = await tx.waSenderLease.findUnique({ where: { phoneId } });
    if (sending?.leaseUntil && sending.leaseUntil > new Date()) return 0;
    const rows = await tx.waAuthKey.findMany({ where: { phoneId }, take: 200, select: { keyHash: true } });
    if (rows.length) await tx.waAuthKey.deleteMany({ where: { phoneId, keyHash: { in: rows.map(row => row.keyHash) } } });
    const remains = await tx.waAuthKey.findMany({ where: { phoneId }, take: 1, select: { keyHash: true } });
    await tx.waAuthSession.update({ where: { phoneId }, data: { migratedAt: remains.length ? new Date(0) : new Date(), ...(!remains.length ? { leaseToken: null, leaseUntil: null } : {}) } });
    return rows.length;
  }, { maxWait: 2000, timeout: 20000 });
}

export async function runAuthMaintenance(ledger: Ledger) {
  const phones = await prisma.phone.findMany({ where: { channel: "whatsapp" }, orderBy: { id: "asc" }, select: { id: true, userId: true } });
  const ids = new Set(phones.map(phone => phone.id));
  for (const id of Object.keys(ledger.phones)) if (!ids.has(id)) delete ledger.phones[id];
  const started = Date.now();
  for (let i = 0; i < Math.min(4, phones.length); i++) {
    const phone = phones[ledger.next % phones.length]; ledger.next++;
    if (phoneMaintenance.has(phone.id)) continue;
    const previous = ledger.phones[phone.id] || { cursor: "", indexOffset: 0 };
    const result = await (maintainDatabaseAuth(phone.id, previous.cursor, previous.indexOffset) || prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT phoneId FROM wa_auth_sessions WHERE phoneId = ${phone.id} FOR UPDATE`;
      const auth = await tx.waAuthSession.findUnique({ where: { phoneId: phone.id } });
      if (!auth?.migratedAt || auth.migratedAt.getTime() === 0 || auth.leaseUntil && auth.leaseUntil > new Date()) return undefined;
      return pruneAuthTokens(tx, phone.id, previous.cursor, previous.indexOffset);
    }, { maxWait: 2000, timeout: 20000 }));
    if (result) {
      ledger.phones[phone.id] = { ...previous, cursor: result.cursor, indexOffset: result.indexOffset };
      health.removed += result.removed; health.compacted += result.compacted;
      if (result.corrupt) console.warn("WA_AUTH_MAINTENANCE_CORRUPT", { phoneId: phone.id, count: result.corrupt });
    }
    if (!previous.sampledAt || Date.now() - previous.sampledAt > 86400000) {
      const count = await prisma.waAuthKey.count({ where: { phoneId: phone.id } });
      if (count >= 50000) console.warn("WA_AUTH_STORE_LARGE", { phoneId: phone.id, keys: count, previous: previous.keys });
      ledger.phones[phone.id] = { ...(ledger.phones[phone.id] || previous), sampledAt: Date.now(), keys: count };
    }
    health.legacyFiles += await pruneMigratedAuthFiles(phone);
    if (Date.now() - started > 10000) break;
  }
  const candidates = await prisma.$queryRaw<Array<{ phoneId: string }>>`SELECT a.phoneId FROM wa_auth_sessions a
    LEFT JOIN phones p ON p.id = a.phoneId WHERE (a.migratedAt = ${new Date(0)}
      OR (p.id IS NULL AND EXISTS (SELECT 1 FROM wa_auth_keys k WHERE k.phoneId = a.phoneId)))
    AND (a.leaseUntil IS NULL OR a.leaseUntil <= ${new Date()})
    ORDER BY a.phoneId LIMIT 4`;
  for (const candidate of candidates) if (!phoneMaintenance.has(candidate.phoneId)) health.removed += await pruneUnownedAuthBatch(candidate.phoneId);
  health.sampledDevices = Object.values(ledger.phones).filter(row => typeof row.keys === "number").length;
  health.largeStores = Object.entries(ledger.phones).filter(([, row]) => (row.keys || 0) >= 50000)
    .map(([phoneId, row]) => ({ phoneId, keys: row.keys! }));
}

export function startAuthMaintenance() {
  let stopping = false, busy: Promise<void> | undefined, ledger: Ledger | undefined;
  health.startedAt = Date.now();
  const tick = () => {
    if (stopping || busy || Date.now() - health.startedAt < 120000) return;
    health.running = true;
    busy = (async () => {
      ledger ||= await loadAuthMaintenanceState(); await runAuthMaintenance(ledger); await saveAuthMaintenanceState(ledger);
      health.lastSuccessAt = Date.now(); health.failures = 0; health.lastError = undefined;
    })().catch(error => {
      health.failures++; health.lastError = typeof error?.code === "string" ? error.code : "MAINTENANCE_FAILED";
      console.error("WA_AUTH_MAINTENANCE_FAILED", { code: health.lastError });
    }).finally(() => { health.running = false; busy = undefined; });
  };
  const startup = setTimeout(tick, 120000), timer = setInterval(tick, 60000);
  startup.unref(); timer.unref();
  return async () => { stopping = true; clearTimeout(startup); clearInterval(timer); await busy; };
}
