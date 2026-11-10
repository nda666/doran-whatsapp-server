import { Prisma } from "@prisma/client";
import { BufferJSON } from "@whiskeysockets/baileys";
import { openWa, sealWa, storageHash } from "./waStorage";

export const authKeyHash = (name: string) => storageHash(name.replace(/\//g, "__").replace(/:/g, "-"));
type KeyWrite = { hash: string; keyName: string; value: string | null };

// Preserve one atomic Signal transaction, but avoid one DB round-trip per key.
export async function writeAuthKeys(tx: Prisma.TransactionClient, phoneId: string, input: KeyWrite[]) {
  const rows = Array.from(new Map(input.map(row => [row.hash, row])).values());
  const removed = rows.filter(row => row.value === null);
  for (let offset = 0; offset < removed.length; offset += 200) {
    await tx.waAuthKey.deleteMany({ where: { phoneId, keyHash: { in: removed.slice(offset, offset + 200).map(row => row.hash) } } });
  }
  let batch: KeyWrite[] = [], bytes = 0;
  const flush = async () => {
    if (!batch.length) return;
    await tx.$executeRaw(Prisma.sql`INSERT INTO wa_auth_keys (phoneId, keyHash, keyName, value) VALUES
      ${Prisma.join(batch.map(row => Prisma.sql`(${phoneId}, ${row.hash}, ${row.keyName}, ${row.value})`))}
      ON DUPLICATE KEY UPDATE keyName = VALUES(keyName), value = VALUES(value)`);
    batch = []; bytes = 0;
  };
  for (const row of rows) {
    if (row.value === null) continue;
    const size = Buffer.byteLength(row.value, "utf8") + Buffer.byteLength(row.keyName, "utf8") + 128;
    if (batch.length && (batch.length >= 100 || bytes + size > 1024 * 1024)) await flush();
    batch.push(row); bytes += size;
  }
  await flush();
}

// Same four weekly buckets as Baileys 7 rc14's CLEAN_TC_TOKENS policy.
// Unknown shapes/types are preserved; no age-based deletion of Signal keys.
export function expiredTcToken(value: unknown, now: number): "keep" | "remove" | { token: Buffer; senderTimestamp: number } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "keep";
  const entry = value as { token?: unknown; timestamp?: unknown; senderTimestamp?: unknown };
  if (Object.keys(entry).some(key => !["token", "timestamp", "senderTimestamp"].includes(key))) return "keep";
  if (entry.token !== undefined && !Buffer.isBuffer(entry.token) && !(entry.token instanceof Uint8Array)) return "keep";
  const seconds = (stamp: unknown): number | null | undefined => {
    if (stamp === undefined || stamp === null) return undefined;
    if (typeof stamp !== "number" && !(typeof stamp === "string" && /^\d+$/.test(stamp))) return null;
    const result = Number(stamp);
    return Number.isSafeInteger(result) && result >= 0 ? result : null;
  };
  const peer = seconds(entry.timestamp), sender = seconds(entry.senderTimestamp);
  if (peer === null || sender === null) return "keep";
  const cutoff = (Math.floor(now / 1000 / 604800) - 3) * 604800;
  const hasPeer = !!(entry.token as Uint8Array | undefined)?.length;
  if (hasPeer && peer !== undefined && peer >= cutoff) return "keep";
  if (sender !== undefined && sender >= cutoff) {
    return hasPeer ? { token: Buffer.alloc(0), senderTimestamp: sender } : "keep";
  }
  return "remove";
}

export async function pruneAuthTokens(tx: Prisma.TransactionClient, phoneId: string, cursor = "", indexOffset = 0, now = Date.now()) {
  const rows = await tx.waAuthKey.findMany({ where: { phoneId, keyName: { startsWith: "tctoken-" }, ...(cursor ? { keyHash: { gt: cursor } } : {}) },
    orderBy: { keyHash: "asc" }, take: 200, select: { keyHash: true, keyName: true, value: true } });
  const removed: string[] = [], changed: KeyWrite[] = [];
  let corrupt = 0;
  for (const row of rows) {
    if (row.keyName === "tctoken-__index.json") continue;
    try {
      if (row.keyHash !== authKeyHash(row.keyName)) { corrupt++; continue; }
      const decision = expiredTcToken(JSON.parse(openWa(row.value, `${phoneId}:${row.keyHash}`), BufferJSON.reviver), now);
      if (decision === "remove") removed.push(row.keyHash);
      else if (decision !== "keep") changed.push({ hash: row.keyHash, keyName: row.keyName, value: sealWa(JSON.stringify(decision, BufferJSON.replacer), `${phoneId}:${row.keyHash}`) });
    } catch { corrupt++; } // Never log encrypted payloads or decrypted credentials.
  }
  if (removed.length) await tx.waAuthKey.deleteMany({ where: { phoneId, keyHash: { in: removed } } });
  await writeAuthKeys(tx, phoneId, changed);
  const indexHash = authKeyHash("tctoken-__index.json");
  const index = await tx.waAuthKey.findUnique({ where: { phoneId_keyHash: { phoneId, keyHash: indexHash } } });
  let indexRemoved = 0, nextIndexOffset = 0;
  if (index && index.value.length < 4 * 1024 * 1024) {
    let jids: string[] | undefined;
    let indexValue: Record<string, unknown> | undefined;
    try {
      const value = JSON.parse(openWa(index.value, `${phoneId}:${indexHash}`), BufferJSON.reviver);
      const parsed: unknown = JSON.parse(Buffer.from(value.token).toString());
      if (Array.isArray(parsed) && parsed.every(jid => typeof jid === "string")) { jids = parsed; indexValue = value; }
      else corrupt++;
    } catch { corrupt++; }
    if (jids) {
        const offset = indexOffset < jids.length ? indexOffset : 0;
        const selected = jids.slice(offset, offset + 200);
        const hashes = selected.map(jid => authKeyHash(`tctoken-${jid}.json`));
        const existing = hashes.length ? await tx.waAuthKey.findMany({ where: { phoneId, keyHash: { in: hashes } }, select: { keyHash: true } }) : [];
        const present = new Set(existing.map(row => row.keyHash));
        const missing = new Set(selected.filter((jid, i) => !present.has(hashes[i])));
        if (missing.size) {
          const keep = jids.filter(jid => !missing.has(jid));
          indexRemoved = jids.length - keep.length;
          await writeAuthKeys(tx, phoneId, [{ hash: indexHash, keyName: "tctoken-__index.json", value: sealWa(JSON.stringify({ ...indexValue, token: Buffer.from(JSON.stringify(keep)) }, BufferJSON.replacer), `${phoneId}:${indexHash}`) }]);
        }
        nextIndexOffset = Math.max(0, offset + selected.length - indexRemoved);
        if (nextIndexOffset >= jids.length - indexRemoved) nextIndexOffset = 0;
    }
  }
  return { scanned: rows.length, removed: removed.length, compacted: changed.length, indexRemoved, corrupt,
    cursor: rows.length === 200 ? rows[rows.length - 1].keyHash : "", indexOffset: nextIndexOffset };
}
