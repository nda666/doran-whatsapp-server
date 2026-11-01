import { prisma } from "../../lib/prisma";
import { normalizePhoneRecipient } from "../../utils/normalizePhoneRecipient";
export { addSendHour, engagementSummary, wibHour, type SendHours } from "./sendHours";

const DAY_MS = 86_400_000;
const counted = new Map<string, number>();
/** Count one reply per person per day, and only from someone this number actually messaged in the last 7 days. */
export async function recordReply(phoneId: string, jid: string | null | undefined, day: string, now = new Date()) {
  if (!jid?.endsWith("@s.whatsapp.net")) return false;
  const key = `${phoneId}:${jid}:${day}`;
  if (counted.has(key)) return false;
  let number: string;
  try { number = normalizePhoneRecipient(`+${jid.split("@")[0].split(":")[0]}`); } catch { return false; }
  const sent = await prisma.waDispatch.findFirst({
    where: { OR: [{ senderPhoneId: phoneId }, { phoneId, senderPhoneId: null }], recipient: number,
      status: { in: ["SENT", "DELIVERED", "READ"] }, sentAt: { gt: new Date(now.getTime() - 7 * DAY_MS) } },
    select: { id: true },
  });
  if (!sent) return false;
  if (counted.size > 20_000) counted.clear();
  counted.set(key, now.getTime());
  await prisma.deviceDailyUsage.upsert({ where: { phoneId_day: { phoneId, day } }, create: { phoneId, day, replies: 1 }, update: { replies: { increment: 1 } } });
  return true;
}
