import type { AutoReply, Phone } from "@prisma/client";
import type { AnyMessageContent, WAMessage, WASocket } from "@whiskeysockets/baileys";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../../lib/prisma";
import { payloadContent } from "./content";
import { loadDispatchImage } from "../dispatch/media";
export async function sendAutoReply(item: AutoReply, phone: Phone, socket: WASocket, messages: WAMessage[]) {
  if (!phone.autoReplyEnabled || item.reply_status !== "active") return;
  const reply = item.reply as any; let content: AnyMessageContent;
  const isGroup = messages[0].key.remoteJid?.endsWith("@g.us");
  if ((item.reply_when === "Group" && !isGroup) || (item.reply_when === "Personal" && isGroup)) return;
  if (item.delaySeconds) await new Promise(resolve => setTimeout(resolve, item.delaySeconds * 1000));
  // Honor disabling the device or rule while a delayed reply is waiting.
  const activeRule = () => prisma.autoReply.findFirst({ where: { id: item.id, phoneId: phone.id, reply_status: "active", phone: { autoReplyEnabled: true } }, select: { id: true, phone: { select: { showTyping: true } } } });
  const current = await activeRule();
  if (!current) return;
  if (item.type === "text") content = { text: reply.text };
  else if (item.type === "button") content = payloadContent({ kind: "button", text: reply.text, buttons: (reply.buttons || []).map((b: any) => ({ id: b.buttonId, text: b.buttonText.displayText })) });
  else if (item.type === "list") content = payloadContent(reply);
  else if (item.type === "image") {
    const url = String(reply.image.url); let image: Buffer;
    if (/^https?:\/\//i.test(url)) image = await loadDispatchImage(url);
    else {
      const root = path.resolve("storage", "uploads"), file = path.resolve("storage", url);
      if (!file.startsWith(root + path.sep) || !/\.(png|jpg|jpeg|gif|webp)$/i.test(file) || !path.basename(file).includes(phone.id)) throw new Error("INVALID_REPLY_MEDIA");
      image = await fs.readFile(file);
    }
    content = { image, caption: reply.caption };
  } else return;
  const jid = messages[0].key.remoteJid!;
  let result: WAMessage | undefined;
  try {
    if (current.phone.showTyping) {
      // Presence is best effort: a failed typing update must not suppress a reply.
      await socket.sendPresenceUpdate("composing", jid).catch(() => undefined);
      // Sending immediately would make the typing indicator effectively invisible.
      await new Promise(resolve => setTimeout(resolve, 1500));
      if (!await activeRule()) return;
    }
    result = await socket.sendMessage(jid, content, item.is_quoted ? { quoted: messages[0] } : undefined);
  } finally {
    if (current.phone.showTyping) await socket.sendPresenceUpdate("paused", jid).catch(() => undefined);
  }
  if (result?.key.id) await prisma.autoReply.updateMany({ where: { id: item.id, userId: phone.userId, phoneId: phone.id }, data: { sentCount: { increment: 1 } } });
}
