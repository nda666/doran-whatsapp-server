import { randomUUID } from "node:crypto";
import { readdir, readFile, lstat } from "node:fs/promises";
import { join } from "node:path";
import { BufferJSON, initAuthCreds, proto } from "@whiskeysockets/baileys";
import type { AuthenticationState, SignalDataTypeMap } from "@whiskeysockets/baileys";
import { prisma } from "../../lib/prisma";
import type { Prisma } from "@prisma/client";
import { openWa, sealWa, storageHash } from "./waStorage";

const LEASE_MS = 120_000;
const shared = globalThis as typeof globalThis & { doranDbAuth?: Map<string, { close: () => Promise<void> }> };
const owners = shared.doranDbAuth || (shared.doranDbAuth = new Map());
const filename = (value: string) => value.replace(/\//g, "__").replace(/:/g, "-");
const keyId = (value: string) => storageHash(filename(value));

export const closeDatabaseAuth = (phoneId: string) => owners.get(phoneId)?.close() || Promise.resolve();

export async function readDatabaseCreds(phoneId: string) {
  const session = await prisma.waAuthSession.findUnique({ where: { phoneId } });
  if (!session?.migratedAt) return { migrated: false, creds: null };
  const hash = keyId("creds.json");
  const row = await prisma.waAuthKey.findUnique({ where: { phoneId_keyHash: { phoneId, keyHash: hash } } });
  return { migrated: true, creds: row ? JSON.parse(openWa(row.value, `${phoneId}:${hash}`), BufferJSON.reviver) : null };
}

export async function clearDatabaseAuth(phoneId: string) {
  await owners.get(phoneId)?.close();
  await prisma.$transaction(async tx => {
    await tx.waAuthSession.upsert({ where: { phoneId }, create: { phoneId, migratedAt: new Date() }, update: {} });
    await tx.$queryRaw`SELECT phoneId FROM wa_auth_sessions WHERE phoneId = ${phoneId} FOR UPDATE`;
    const owner = await tx.waAuthSession.findUniqueOrThrow({ where: { phoneId } });
    if (owner.leaseToken && owner.leaseUntil && owner.leaseUntil > new Date()) throw new Error("WA_AUTH_IN_USE");
    await tx.waAuthKey.deleteMany({ where: { phoneId } });
    // A tombstone prevents a logged-out session being reimported from old files.
    await tx.waAuthSession.update({ where: { phoneId }, data: { migratedAt: new Date(), leaseToken: null, leaseUntil: null } });
  });
}

/** Encrypted DB auth. Imported batches stay invisible until the migration marker commits. */
export async function createDatabaseAuthState(phoneId: string, folder: string, onLeaseLost: () => void) {
  await owners.get(phoneId)?.close();
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
      }, { timeout: 30_000 });
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
      await prisma.waAuthSession.updateMany({ where: { phoneId, leaseToken: token }, data: { leaseToken: null, leaseUntil: null } });
      if (owners.get(phoneId)?.close === close) owners.delete(phoneId);
    }
  })());
  owners.set(phoneId, { close });
  try {
    const session = await prisma.waAuthSession.findUniqueOrThrow({ where: { phoneId } });
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
      return mutate(async tx => {
        for (const row of rows) {
          const where = { phoneId_keyHash: { phoneId, keyHash: row.hash } };
          if (row.value === null) await tx.waAuthKey.deleteMany({ where: { phoneId, keyHash: row.hash } });
          else await tx.waAuthKey.upsert({ where, create: { phoneId, keyHash: row.hash, keyName: row.keyName, value: row.value }, update: { keyName: row.keyName, value: row.value } });
        }
      });
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
