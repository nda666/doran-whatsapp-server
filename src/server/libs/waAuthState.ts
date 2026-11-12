import { randomUUID } from "node:crypto";
import { readdir, readFile, lstat } from "node:fs/promises";
import { join } from "node:path";
import { BufferJSON, initAuthCreds, proto } from "@whiskeysockets/baileys";
import type { AuthenticationState, SignalDataTypeMap } from "@whiskeysockets/baileys";
import { prisma } from "../../lib/prisma";
import type { Prisma } from "@prisma/client";
import { openWa, sealWa, storageHash } from "./waStorage";
import { pruneAuthTokens, writeAuthKeys } from "./authKeyMaintenance";

const LEASE_MS = 120_000;
type AuthOwner = { close: () => Promise<void>; maintain?: (cursor: string, offset: number) => Promise<Awaited<ReturnType<typeof pruneAuthTokens>> | undefined> };
const shared = globalThis as typeof globalThis & { doranDbAuth?: Map<string, AuthOwner> };
const owners = shared.doranDbAuth || (shared.doranDbAuth = new Map());
const filename = (value: string) => value.replace(/\//g, "__").replace(/:/g, "-");
const keyId = (value: string) => storageHash(filename(value));

export const closeDatabaseAuth = (phoneId: string) => owners.get(phoneId)?.close() || Promise.resolve();
export const maintainDatabaseAuth = (phoneId: string, cursor: string, offset: number) => owners.get(phoneId)?.maintain?.(cursor, offset);

export async function readDatabaseCreds(phoneId: string) {
  const session = await prisma.waAuthSession.findUnique({ where: { phoneId } });
  if (!session?.migratedAt) return { migrated: false, creds: null };
  const hash = keyId("creds.json");
  const row = await prisma.waAuthKey.findUnique({ where: { phoneId_keyHash: { phoneId, keyHash: hash } } });
  return { migrated: true, creds: row ? JSON.parse(openWa(row.value, `${phoneId}:${hash}`), BufferJSON.reviver) : null };
}

export async function clearDatabaseAuth(phoneId: string, beforeBatch: () => Promise<void> = async () => {}) {
  // Failed pending writes must not prevent an explicitly requested auth reset.
  // close() releases its lease in finally; the transaction below still fences
  // a different live owner, including when that release itself failed.
  await owners.get(phoneId)?.close().catch(() => {});
  const token = randomUUID();
  let acquired = false;
  await beforeBatch();
  await prisma.$transaction(async tx => {
    await tx.waAuthSession.upsert({ where: { phoneId }, create: { phoneId, migratedAt: new Date() }, update: {} });
    await tx.$queryRaw`SELECT phoneId FROM wa_auth_sessions WHERE phoneId = ${phoneId} FOR UPDATE`;
    const owner = await tx.waAuthSession.findUniqueOrThrow({ where: { phoneId } });
    if (owner.leaseToken && owner.leaseUntil && owner.leaseUntil > new Date()) throw new Error("WA_AUTH_IN_USE");
    // Epoch marks an interrupted reset persistently. Neither old files nor
    // leftover Signal keys may be used until all batches have committed.
    await tx.waAuthSession.update({ where: { phoneId }, data: { migratedAt: new Date(0), leaseToken: token, leaseUntil: new Date(Date.now() + LEASE_MS) } });
    await tx.waAuthKey.deleteMany({ where: { phoneId, keyHash: keyId("creds.json") } });
  }, { maxWait: 10_000, timeout: 60_000 });
  acquired = true;
  try {
    while (true) {
      await beforeBatch();
      const remaining = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT phoneId FROM wa_auth_sessions WHERE phoneId = ${phoneId} FOR UPDATE`;
        const owner = await tx.waAuthSession.findUniqueOrThrow({ where: { phoneId } });
        if (owner.leaseToken !== token || !owner.leaseUntil || owner.leaseUntil <= new Date()) throw new Error("WA_AUTH_LEASE_LOST");
        const keys = await tx.waAuthKey.findMany({ where: { phoneId }, select: { keyHash: true }, take: 200 });
        if (!keys.length) {
          await tx.waAuthSession.update({ where: { phoneId }, data: { migratedAt: new Date(), leaseToken: null, leaseUntil: null } });
          return false;
        }
        await tx.waAuthKey.deleteMany({ where: { phoneId, keyHash: { in: keys.map(key => key.keyHash) } } });
        await tx.waAuthSession.update({ where: { phoneId }, data: { leaseUntil: new Date(Date.now() + LEASE_MS) } });
        return true;
      }, { maxWait: 10_000, timeout: 60_000 });
      if (!remaining) break;
    }
  } finally {
    if (acquired) await prisma.waAuthSession.updateMany({ where: { phoneId, leaseToken: token }, data: { leaseToken: null, leaseUntil: null } });
  }
}

/** Encrypted DB auth. Imported batches stay invisible until the migration marker commits. */
export async function createDatabaseAuthState(phoneId: string, folder: string, onLeaseLost: () => void) {
  // A settled local owner must not poison every future reconnect. The database
  // acquisition below still fences an unreleased or different live lease.
  await owners.get(phoneId)?.close().catch(() => {
    console.error("WA_AUTH_PREVIOUS_CLOSE_FAILED", phoneId);
  });
  const token = randomUUID();
  await prisma.waAuthSession.createMany({ data: [{ phoneId }], skipDuplicates: true });
  const acquired = await prisma.waAuthSession.updateMany({
    where: { phoneId, OR: [{ leaseToken: null }, { leaseUntil: { lte: new Date() } }] },
    data: { leaseToken: token, leaseUntil: new Date(Date.now() + LEASE_MS) },
  });
  if (acquired.count !== 1) throw new Error("WA_AUTH_IN_USE");
  let closed = false, lost = false, heartbeatRunning = false;
  let writes = Promise.resolve();
  const assertOwned = async () => {
    if (closed || lost) throw new Error("WA_AUTH_LEASE_LOST");
    const owned = await prisma.waAuthSession.count({ where: { phoneId, leaseToken: token, leaseUntil: { gt: new Date() } } });
    if (owned !== 1) { lost = true; onLeaseLost(); throw new Error("WA_AUTH_LEASE_LOST"); }
  };
  const mutate = (fn: (tx: Prisma.TransactionClient) => Promise<void>) => {
    // Do not swallow a failed key write: all subsequent writes fail closed.
    const next = writes.then(async () => {
      await assertOwned();
      await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT phoneId FROM wa_auth_sessions WHERE phoneId = ${phoneId} FOR UPDATE`;
        const owner = await tx.waAuthSession.findUniqueOrThrow({ where: { phoneId } });
        if (owner.leaseToken !== token || !owner.leaseUntil || owner.leaseUntil <= new Date()) throw new Error("WA_AUTH_LEASE_LOST");
        await fn(tx);
      }, { timeout: 60_000 });
    });
    writes = next;
    next.catch(() => { if (!lost) { lost = true; onLeaseLost(); } });
    return next;
  };
  const heartbeat = setInterval(() => {
    if (closed || lost || heartbeatRunning) return;
    heartbeatRunning = true;
    prisma.waAuthSession.updateMany({ where: { phoneId, leaseToken: token, leaseUntil: { gt: new Date() } },
      data: { leaseUntil: new Date(Date.now() + LEASE_MS) } })
      .then(result => { if (result.count !== 1) throw new Error("WA_AUTH_LEASE_LOST"); })
      .catch(() => { lost = true; onLeaseLost(); })
      .finally(() => { heartbeatRunning = false; });
  }, 30_000);
  heartbeat.unref();
  let closing: Promise<void> | undefined;
  const close = () => closing || (closing = (async () => {
    clearInterval(heartbeat);
    try { await writes; }
    finally {
      closed = true;
      try {
        await prisma.waAuthSession.updateMany({ where: { phoneId, leaseToken: token }, data: { leaseToken: null, leaseUntil: null } });
      } finally {
        // Even a failed release has finished retiring this local owner. Leave
        // the DB lease intact on failure; reconnect must acquire it normally.
        if (owners.get(phoneId)?.close === close) owners.delete(phoneId);
      }
    }
  })());
  owners.set(phoneId, { close, maintain: (cursor: string, offset: number) => prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT phoneId FROM wa_auth_sessions WHERE phoneId = ${phoneId} FOR UPDATE`;
    const owner = await tx.waAuthSession.findUniqueOrThrow({ where: { phoneId } });
    if (closed || lost || owner.leaseToken !== token || !owner.leaseUntil || owner.leaseUntil <= new Date() || !owner.migratedAt || owner.migratedAt.getTime() === 0) return undefined;
    // The owner-row lock serializes maintenance with normal writes. Maintenance
    // failures do not poison the Signal write queue or disconnect the socket.
    return pruneAuthTokens(tx, phoneId, cursor, offset);
  }, { maxWait: 2_000, timeout: 20_000 }) });
  try {
    const session = await prisma.waAuthSession.findUniqueOrThrow({ where: { phoneId } });
    if (session.migratedAt?.getTime() === 0) throw new Error("WA_AUTH_RESET_INCOMPLETE");
    if (!session.migratedAt) {
      const entries: { phoneId: string; keyHash: string; keyName: string; value: string }[] = [];
      let batchBytes = 0;
      let files: string[] = [];
      try {
        const info = await lstat(folder);
        if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("WA_AUTH_UNSAFE_FOLDER");
        files = await readdir(folder);
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      if (files.some(file => file.endsWith(".json")) && !files.includes("creds.json")) throw new Error("WA_AUTH_CREDS_MISSING");
      // Interrupted imports may contain staged rows; no DB session can read them yet.
      await mutate(async tx => { await tx.waAuthKey.deleteMany({ where: { phoneId } }); });
      const flush = async () => {
        if (!entries.length) return;
        const batch = entries.splice(0);
        await mutate(async tx => { await tx.waAuthKey.createMany({ data: batch }); });
        batchBytes = 0;
      };
      for (const file of files.filter(file => file.endsWith(".json"))) {
        const target = join(folder, file), info = await lstat(target);
        if (!info.isFile() || info.isSymbolicLink()) throw new Error("WA_AUTH_UNSAFE_FILE");
        if (info.size > 16 * 1024 * 1024) throw new Error("WA_AUTH_FILE_TOO_LARGE");
        const raw = await readFile(target, "utf8");
        try { JSON.parse(raw, BufferJSON.reviver); }
        catch { throw new Error("WA_AUTH_CORRUPT_FILE"); } // Do not put credential snippets in error logs.
        const hash = keyId(file);
        const value = sealWa(raw, `${phoneId}:${hash}`);
        entries.push({ phoneId, keyHash: hash, keyName: file, value });
        batchBytes += value.length;
        if (entries.length >= 100 || batchBytes >= 4 * 1024 * 1024) await flush();
      }
      await flush();
      await mutate(async tx => {
        await tx.waAuthSession.update({ where: { phoneId }, data: { migratedAt: new Date() } });
      });
    }
    const read = async (name: string) => {
      await assertOwned();
      const hash = keyId(name);
      const row = await prisma.waAuthKey.findUnique({ where: { phoneId_keyHash: { phoneId, keyHash: hash } } });
      return row ? JSON.parse(openWa(row.value, `${phoneId}:${hash}`), BufferJSON.reviver) : null;
    };
    const creds = await read("creds.json") || initAuthCreds();
    const save = (data: { name: string; value: unknown }[]) => {
      // Snapshot now: buffers and credentials may mutate before queued writes run.
      const rows = data.map(item => {
        const hash = keyId(item.name);
        return { hash, keyName: filename(item.name), value: item.value == null ? null : sealWa(JSON.stringify(item.value, BufferJSON.replacer), `${phoneId}:${hash}`) };
      });
      return mutate(tx => writeAuthKeys(tx, phoneId, rows));
    };
    const state: AuthenticationState = { creds, keys: {
      get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
        await assertOwned();
        const values: { [id: string]: SignalDataTypeMap[T] } = {};
        const hashes = Array.from(new Set(ids.map(id => keyId(`${type}-${id}.json`))));
        const stored = new Map<string, string>();
        for (let i = 0; i < hashes.length; i += 500) {
          const rows = await prisma.waAuthKey.findMany({ where: { phoneId, keyHash: { in: hashes.slice(i, i + 500) } } });
          for (const row of rows) stored.set(row.keyHash, row.value);
        }
        for (const id of ids) {
          const hash = keyId(`${type}-${id}.json`), raw = stored.get(hash);
          let value = raw ? JSON.parse(openWa(raw, `${phoneId}:${hash}`), BufferJSON.reviver) : null;
          if (type === "app-state-sync-key" && value) value = proto.Message.AppStateSyncKeyData.fromObject(value);
          values[id] = value;
        }
        return values;
      },
      set: data => save(Object.entries(data).flatMap(([type, entries]) => Object.entries(entries || {}).map(([id, value]) => ({ name: `${type}-${id}.json`, value })))),
    } };
    return { state, saveCreds: () => save([{ name: "creds.json", value: creds }]), close, assertOwned };
  } catch (error) { await close().catch(() => {}); throw error; }
}
