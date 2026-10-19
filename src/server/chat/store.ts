import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { downloadContentFromMessage } from "@whiskeysockets/baileys";
import type { WAMessage, WASocket } from "@whiskeysockets/baileys";
import { prisma } from "../../lib/prisma";
import { chatContent, chatJid, CHAT_MEDIA_LIMIT } from "./content";
import { chatMediaDirectory, chatMediaPath } from "./media";

export async function captureChatMessage(phoneId: string, message: WAMessage, socket?: WASocket) {
  let jid = message.key.remoteJid || "";
  const waMessageId = message.key.id;
  if (!waMessageId || !chatJid(jid) || waMessageId.length > 100) return;
  const phone = await prisma.phone.findUnique({ where: { id: phoneId } });
  if (!phone?.saveIncomingMessages) return;
  const seconds = Number(message.messageTimestamp);
  if (phone.saveIncomingSince && Number.isFinite(seconds) && seconds * 1000 + 999 < phone.saveIncomingSince.getTime()) return;
  if (jid.endsWith("@lid")) {
    const alternate = message.key.remoteJidAlt;
    const mapped = alternate?.endsWith("@s.whatsapp.net") ? alternate : await socket?.signalRepository.lidMapping.getPNForLID(jid).catch(() => undefined);
    if (mapped && /^\d+@s\.whatsapp\.net$/.test(mapped)) jid = mapped;
  }
  const parsed = chatContent(message);
  if (!parsed) return;
  const duplicate = await prisma.chatMessage.findFirst({ where: { waMessageId, conversation: { phoneId, jid } }, select: { id: true } });
  if (duplicate) {
    if (message.key.fromMe) await recordChatReceipt(phoneId, waMessageId, 2);
    return;
  }
  const fromMe = !!message.key.fromMe;
  const label = jid.endsWith("@g.us") ? `Grup ${jid.split("@")[0]}` : message.pushName?.slice(0, 200) || jid.split("@")[0];
  const createdAt = Number.isFinite(seconds) && seconds > 0 ? new Date(Math.min(seconds * 1000, Date.now())) : new Date();
  let mediaPath: string | null = null;
  let text = parsed.text;
  if (parsed.media && parsed.mediaType) {
    try {
      if (Number(parsed.media.fileLength || 0) > CHAT_MEDIA_LIMIT) throw new Error("CHAT_MEDIA_TOO_LARGE");
      const stream = await downloadContentFromMessage(parsed.media, parsed.mediaType as "image" | "video" | "audio" | "document" | "sticker", { options: { signal: AbortSignal.timeout(15000) } });
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of stream) {
        size += chunk.length;
        if (size > CHAT_MEDIA_LIMIT) { stream.destroy(); throw new Error("CHAT_MEDIA_TOO_LARGE"); }
        chunks.push(Buffer.from(chunk));
      }
      mediaPath = `${randomUUID()}.bin`;
      await fs.mkdir(chatMediaDirectory(), { recursive: true });
      await fs.writeFile(chatMediaPath(mediaPath), Buffer.concat(chunks));
    } catch {
      if (mediaPath) await fs.unlink(chatMediaPath(mediaPath)).catch(() => {});
      mediaPath = null;
      text = `${text}${text ? "\n" : ""}[Lampiran tidak tersimpan; buka di WhatsApp]`;
    }
  }
  let kept = false;
  try {
    kept = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM phones WHERE id = ${phoneId} FOR UPDATE`;
      const current = await tx.phone.findUnique({ where: { id: phoneId } });
      if (!current?.saveIncomingMessages) return false;
      if (current.saveIncomingSince && Number.isFinite(seconds) && seconds * 1000 + 999 < current.saveIncomingSince.getTime()) return false;
      const conversation = await tx.chatConversation.upsert({ where: { phoneId_jid: { phoneId, jid } },
        create: { phoneId, userId: current.userId, jid, name: label, lastMessageAt: createdAt }, update: {} });
      const inserted = await tx.chatMessage.createMany({ data: [{ conversationId: conversation.id, waMessageId,
        direction: fromMe ? "OUT" : "IN", type: parsed.type, text, quotedText: parsed.quote,
        sender: (message.key.participant || message.pushName || "").slice(0, 200) || null,
        status: fromMe ? "SENT" : "RECEIVED", mediaPath,
        mediaMime: parsed.media?.mimetype?.slice(0, 100) || null,
        mediaName: (parsed.media && "fileName" in parsed.media ? String(parsed.media.fileName || "Lampiran") : parsed.type).slice(0, 255), createdAt,
      }], skipDuplicates: true });
      if (!inserted.count) return false;
      await tx.chatConversation.update({ where: { id: conversation.id }, data: {
        ...(!fromMe ? { unreadCount: { increment: 1 }, archived: false, ...(!jid.endsWith("@g.us") && message.pushName ? { name: label } : {}) } : {}),
        ...(createdAt >= conversation.lastMessageAt ? { lastMessage: text.slice(0, 500) || `[${parsed.type}]`, lastMessageAt: createdAt } : {}),
      } });
      return true;
    });
  } finally {
    if (!kept && mediaPath) await fs.unlink(chatMediaPath(mediaPath)).catch(() => {});
  }
}

export async function recordChatReceipt(phoneId: string, waMessageId: string, level: number) {
  if (level < 2) return;
  const status = level >= 4 ? "READ" : level >= 3 ? "DELIVERED" : "SENT";
  const lower = level >= 4 ? ["SENDING", "UNCERTAIN", "SENT", "DELIVERED"] : level >= 3 ? ["SENDING", "UNCERTAIN", "SENT"] : ["SENDING", "UNCERTAIN"];
  await prisma.chatMessage.updateMany({ where: { waMessageId, direction: "OUT", conversation: { phoneId }, status: { in: lower } }, data: { status } });
}
