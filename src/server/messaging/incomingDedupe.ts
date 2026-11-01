import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";

export type IncomingKey = { id?: string | null; remoteJid?: string | null; remoteJidAlt?: string | null; participant?: string | null; participantAlt?: string | null; fromMe?: boolean | null };

/** Persistent at-most-once admission, not guaranteed completion of external effects after a crash.
 * Claims never expire: old replays must not send again. No message bodies are retained here.
 */
export async function claimIncoming(phoneId: string, key: IncomingKey, action: "LIVE" | "STOP", db: Pick<Prisma.TransactionClient, "waIncomingEffect"> = prisma) {
  if (!key.id || !key.remoteJid || key.fromMe) return false;
  const normalize = (jid: string) => jid.replace(/:\d+@/, "@");
  // PN/LID can swap primary/alternate positions on redelivery. Prefer the PN in either slot.
  const identity = (primary: string, alternate?: string | null) => normalize(
    [primary, alternate].find(jid => jid?.endsWith("@s.whatsapp.net")) || primary,
  );
  const keyHash = createHash("sha256").update(JSON.stringify([
    identity(key.remoteJid, key.remoteJidAlt), key.id,
    identity(key.participant || "", key.participantAlt),
  ])).digest("hex");
  try {
    await db.waIncomingEffect.create({ data: { phoneId, keyHash, action } });
    return true;
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return false;
    throw error; // Never fall back to sending without dedupe when the database fails.
  }
}

export async function claimLiveIncoming(phoneId: string, key: IncomingKey, type: string) {
  // History cannot consume a live claim or trigger webhook/auto-reply effects.
  return type === "notify" && await claimIncoming(phoneId, key, "LIVE");
}
