import { BufferJSON, jidNormalizedUser } from "@whiskeysockets/baileys";
import type { WAMessage, WAMessageKey, WASocket, GroupMetadata } from "@whiskeysockets/baileys";
import { prisma } from "../../lib/prisma";
import { storageHash, sealWa, openWa } from "./waStorage";

const RETENTION_MS = 7 * 86400000;
const shared = globalThis as typeof globalThis & { doranProtocolCleanupAt?: number };
// A retry receipt's participant is the requesting device, not the outgoing author.
const hashKey = (key: WAMessageKey) => storageHash(JSON.stringify([jidNormalizedUser(key.remoteJid || ""), key.id, !!key.fromMe, key.fromMe ? "" : jidNormalizedUser(key.participant || "")]));
export async function storeProtocolMessage(phoneId: string, message: WAMessage) {
  if (!message.key.id || !message.key.remoteJid || !message.message) return;
  const keyHash = hashKey(message.key);
  const data = { value: sealWa(JSON.stringify(message.message, BufferJSON.replacer), `${phoneId}:message:${keyHash}`), expiresAt: new Date(Date.now() + RETENTION_MS) };
  await prisma.waProtocolMessage.upsert({ where: { phoneId_keyHash: { phoneId, keyHash } }, create: { phoneId, keyHash, ...data }, update: data });
  if (Date.now() - (shared.doranProtocolCleanupAt || 0) > 3600000) {
    shared.doranProtocolCleanupAt = Date.now();
    await prisma.waProtocolMessage.deleteMany({ where: { expiresAt: { lte: new Date() } } });
  }
}
export async function getProtocolMessage(phoneId: string, key: WAMessageKey) {
  const keyHash = hashKey(key);
  const row = await prisma.waProtocolMessage.findUnique({ where: { phoneId_keyHash: { phoneId, keyHash } } });
  if (!row || row.expiresAt <= new Date()) return undefined;
  return JSON.parse(openWa(row.value, `${phoneId}:message:${keyHash}`), BufferJSON.reviver);
}
export function groupMetadataCache(getSocket: () => WASocket) {
  const values = new Map<string, { metadata: GroupMetadata; expires: number }>();
  const pending = new Map<string, Promise<GroupMetadata>>();
  return {
    invalidate: (jid: string) => values.delete(jid),
    get: async (jid: string) => {
      const cached = values.get(jid);
      if (cached && cached.expires > Date.now()) return cached.metadata;
      const existing = pending.get(jid);
      if (existing) return existing;
      const query = getSocket().groupMetadata(jid).then(metadata => {
        if (values.size >= 500) values.delete(values.keys().next().value!);
        values.set(jid, { metadata, expires: Date.now() + 300_000 });
        return metadata;
      }).finally(() => pending.delete(jid));
      pending.set(jid, query);
      return query;
    },
  };
}
