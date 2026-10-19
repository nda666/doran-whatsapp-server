import type { WAMessageKey, WASocket } from "@whiskeysockets/baileys";

function phoneFromJid(jid?: string | null): string | undefined {
  return jid?.match(/^(\d+)(?::\d+)?@s\.whatsapp\.net$/)?.[1];
}

// A WhatsApp LID is an internal identifier, not a telephone number.
export async function webhookSender(key: WAMessageKey, socket: WASocket): Promise<string> {
  const jid = key.remoteJid || "";
  const phone = phoneFromJid(jid);
  if (phone) return phone;
  if (!jid.endsWith("@lid")) return jid.split("@")[0];

  const alternatePhone = phoneFromJid(key.remoteJidAlt);
  if (alternatePhone) return alternatePhone;
  const mapped = await socket.signalRepository.lidMapping.getPNForLID(jid);
  const mappedPhone = phoneFromJid(mapped);
  if (mappedPhone) return mappedPhone;
  throw new Error("WEBHOOK_SENDER_PHONE_UNRESOLVED");
}
