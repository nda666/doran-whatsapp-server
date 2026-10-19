import { normalizeMessageContent } from "@whiskeysockets/baileys";
import type { WAMessage } from "@whiskeysockets/baileys";

export const chatJid = (jid: string) => /^(?:\d+(?:-\d+)?@g\.us|\d+@s\.whatsapp\.net|\d+@lid)$/.test(jid);
export const CHAT_MEDIA_LIMIT = 25 * 1024 * 1024;

export function chatContent(message: WAMessage) {
  const original = message.message?.ephemeralMessage?.message || message.message;
  // Keep disappearing/view-once media as a placeholder rather than an enduring copy.
  if (original?.viewOnceMessage || original?.viewOnceMessageV2 || original?.viewOnceMessageV2Extension) {
    return { type: "unsupported", text: "[Pesan sekali lihat — buka di WhatsApp]", quote: null, media: null, mediaType: null };
  }
  const content = normalizeMessageContent(original);
  if (!content || content.protocolMessage || content.senderKeyDistributionMessage) return null;
  const media = content.imageMessage || content.videoMessage || content.audioMessage || content.documentMessage || content.stickerMessage;
  const type = content.imageMessage ? "image" : content.videoMessage ? "video" : content.audioMessage ? "audio" : content.documentMessage ? "document" : content.stickerMessage ? "sticker" : "text";
  const quoteContent = normalizeMessageContent(content.extendedTextMessage?.contextInfo?.quotedMessage || media?.contextInfo?.quotedMessage);
  const quote = quoteContent?.conversation || quoteContent?.extendedTextMessage?.text || quoteContent?.imageMessage?.caption || (quoteContent ? "[Pesan lampiran]" : null);
  let text = content.conversation ?? content.extendedTextMessage?.text ?? content.imageMessage?.caption ?? content.videoMessage?.caption ?? content.documentMessage?.caption ?? "";
  if (content.contactMessage) text = `[Kontak] ${content.contactMessage.displayName || ""}`;
  else if (content.contactsArrayMessage) text = `[Kontak] ${content.contactsArrayMessage.displayName || ""}`;
  else if (content.locationMessage) text = `[Lokasi] ${content.locationMessage.name || ""}\nhttps://maps.google.com/?q=${content.locationMessage.degreesLatitude},${content.locationMessage.degreesLongitude}`;
  else if (!text && !media) text = "[Pesan ini dapat dilihat di WhatsApp]";
  return { type, text: text.slice(0, 65536), quote: quote?.slice(0, 10000) || null, media, mediaType: media ? type : null };
}
