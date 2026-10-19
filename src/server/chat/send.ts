import { SendGuardError } from "../messaging/safety";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import type { AnyMessageContent } from "@whiskeysockets/baileys";
import { generateMessageIDV2 } from "@whiskeysockets/baileys";
import { prisma } from "../../lib/prisma";
import { session } from "../libs/makeWASocket";
import { phoneMaintenance } from "../libs/phoneMaintenance";
import { assetPath, loadAssetContent } from "../campaigns/media";
import { chatMediaDirectory, chatMediaPath } from "./media";
import { CHAT_MEDIA_LIMIT } from "./content";

export class ChatSendError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function sendChatReply(conversationId: string, scope: { userId?: string }, input: { requestId: string; text: string; mediaId?: string; replyToId?: string }) {
  const conversation = await prisma.chatConversation.findFirst({ where: { id: conversationId, ...scope, phone: scope }, include: { phone: true } });
  if (!conversation) throw new ChatSendError(404, "Percakapan tidak ditemukan.");
  const { phone } = conversation;
  const requestHash = createHash("sha256").update(JSON.stringify([input.text, input.mediaId || null, input.replyToId || null])).digest("hex");
  // Return a previous attempt before checking connection state, including after a lost HTTP response.
  const previous = await prisma.chatMessage.findUnique({ where: { conversationId_clientRequestId: { conversationId, clientRequestId: input.requestId } } });
  if (previous) {
    if (previous.requestHash !== requestHash) throw new ChatSendError(409, "ID kirim sudah digunakan untuk pesan lain.");
    return previous;
  }
  const socket = session.get(phone.id);
  if (!phone.saveIncomingMessages) throw new ChatSendError(409, "Aktifkan Simpan Pesan Masuk pada perangkat untuk membalas di sini.");
  if (phone.active !== 1 || !socket?.ws.isOpen || !socket.user || phoneMaintenance.has(phone.id)) throw new ChatSendError(409, "Perangkat belum terhubung. Hubungkan kembali melalui menu Perangkat HP.");
  const quote = input.replyToId ? await prisma.chatMessage.findFirst({ where: { id: input.replyToId, conversationId } }) : null;
  if (input.replyToId && !quote) throw new ChatSendError(404, "Pesan yang dibalas tidak ditemukan.");
  const quoted = quote ? { key: { id: quote.waMessageId, remoteJid: conversation.jid, fromMe: quote.direction === "OUT",
    ...(conversation.jid.endsWith("@g.us") && quote.sender?.includes("@") ? { participant: quote.sender } : {}) }, message: { conversation: quote.text || `[${quote.type}]` } } : undefined;
  let content: AnyMessageContent = { text: input.text };
  let mediaPath: string | null = null, mediaMime: string | null = null, mediaName: string | null = null, type = "text";
  let buffer: Buffer | undefined;
  if (input.mediaId) {
    const asset = await prisma.mediaAsset.findFirst({ where: { id: input.mediaId, ...scope } });
    if (!asset) throw new ChatSendError(404, "File tidak ditemukan.");
    buffer = await fs.readFile(assetPath(asset.filename));
    if (buffer.length > CHAT_MEDIA_LIMIT) throw new ChatSendError(400, "Lampiran maksimal 25 MB.");
    // The actor is already authorized for this asset by ownerScope above.
    content = await loadAssetContent(asset, asset.userId, input.text);
    type = asset.mime.startsWith("image/") ? "image" : asset.mime.startsWith("video/") ? "video" : asset.mime.startsWith("audio/") ? "audio" : "document";
    mediaPath = `${randomUUID()}.bin`; mediaMime = asset.mime; mediaName = asset.originalName || asset.name;
    await fs.mkdir(chatMediaDirectory(), { recursive: true });
    await fs.writeFile(chatMediaPath(mediaPath), buffer);
  }
  let claimed = false;
  let row;
  try {
    row = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM phones WHERE id = ${phone.id} FOR UPDATE`;
      const current = await tx.phone.findUnique({ where: { id: phone.id } });
      if (phoneMaintenance.has(phone.id)) throw new ChatSendError(409, "Perangkat sedang dibersihkan.");
      if (!current?.saveIncomingMessages || current.active !== 1 || current.userId !== phone.userId) throw new ChatSendError(409, "Perangkat tidak tersedia untuk membalas.");
      const existing = await tx.chatMessage.findUnique({ where: { conversationId_clientRequestId: { conversationId, clientRequestId: input.requestId } } });
      if (existing) {
        if (existing.requestHash !== requestHash) throw new ChatSendError(409, "ID kirim sudah digunakan untuk pesan lain.");
        return existing;
      }
      const created = await tx.chatMessage.create({ data: { conversationId, clientRequestId: input.requestId, requestHash,
        waMessageId: generateMessageIDV2(socket.user!.id), direction: "OUT", type, text: input.text, quotedText: quoted?.message.conversation.slice(0, 10000) || null, status: "SENDING", mediaPath, mediaMime, mediaName, sourceMediaId: input.mediaId || null } });
      await tx.chatConversation.update({ where: { id: conversationId }, data: { lastMessage: input.text.slice(0, 500) || `[${type}]`, lastMessageAt: created.createdAt, archived: false } });
      claimed = true;
      return created;
    });
  } finally {
    if (!claimed && mediaPath) await fs.unlink(chatMediaPath(mediaPath)).catch(() => {});
  }
  if (!claimed) return row;
  let timer: NodeJS.Timeout | undefined;
  try {
    if (phone.showTyping) {
      await socket.sendPresenceUpdate("composing", conversation.jid).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    if (phoneMaintenance.has(phone.id) || !socket.ws.isOpen) throw new Error("CONNECTION_CLOSED");
    const current = await prisma.phone.findUnique({ where: { id: phone.id } });
    if (!current?.saveIncomingMessages || current.active !== 1) {
      await prisma.chatMessage.updateMany({ where: { id: row.id, status: "SENDING" }, data: { status: "FAILED" } });
    } else {
      const sent = await Promise.race([
        socket.sendMessage(conversation.jid, content, { messageId: row.waMessageId, ...(quoted ? { quoted } : {}) }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("CHAT_SEND_TIMEOUT")), 20000); }),
      ]);
      if (!sent?.key.id) throw new Error("NO_MESSAGE_ID");
      await prisma.chatMessage.updateMany({ where: { id: row.id, status: "SENDING" }, data: { status: "SENT" } });
    }
  } catch (error) {
    // Never blindly retry a message whose transport result might have been lost.
    await prisma.chatMessage.updateMany({ where: { id: row.id, status: "SENDING" }, data: { status: error instanceof SendGuardError ? "FAILED" : "UNCERTAIN" } });
  } finally {
    if (timer) clearTimeout(timer);
    if (phone.showTyping) await socket.sendPresenceUpdate("paused", conversation.jid).catch(() => {});
  }
  return prisma.chatMessage.findUniqueOrThrow({ where: { id: row.id } });
}
