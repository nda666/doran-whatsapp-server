import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { normalizePhoneRecipient } from "../../utils/normalizePhoneRecipient";
import { campaignRecipientSchema, mergeCampaignRecipients, renderCampaignMessage } from "../../lib/campaignPersonalization";

export const campaignInput = z.object({
  id: z.string().uuid(), name: z.string().trim().min(1).max(200),
  message: z.string().trim().max(10000).default(""), phoneIds: z.array(z.string().uuid()).min(1).max(100),
  messageType: z.enum(["message", "sticker"]).default("message"),
  mediaId: z.string().uuid().nullable().optional(), scheduledAt: z.string().datetime().optional(),
  delayMin: z.number().int().min(1).max(3600).default(5), delayMax: z.number().int().min(1).max(3600).default(15),
  groupIds: z.array(z.string().uuid()).max(100).default([]),
  contactIds: z.array(z.string().uuid()).max(10000).default([]),
  allContacts: z.boolean().default(false),
  recipients: z.array(campaignRecipientSchema).max(10000).default([]),
}).refine(v => v.delayMax >= v.delayMin, "Delay maksimum harus >= minimum")
  .refine(v => v.messageType === "sticker" ? !!v.mediaId : !!v.message, "Isi pesan atau pilih file stiker.")
  .refine(v => v.messageType !== "sticker" || !v.message, "Stiker tidak mendukung caption.");

export function validCampaignMedia(input: z.infer<typeof campaignInput>, media: { mime: string; size: number; userId: string } | null, userId: string) {
  return input.messageType !== "sticker" || !!media && media.userId === userId && media.mime === "image/webp" && media.size <= 100 * 1024;
}

export function campaignJobs(input: z.infer<typeof campaignInput>, userId: string, contacts: { number: string; name: string }[]) {
  const start = input.scheduledAt ? new Date(input.scheduledAt) : new Date();
  if (start.getTime() > Date.now() + 366 * 86400000) throw new Error("Jadwal maksimal satu tahun.");
  const targets = mergeCampaignRecipients(contacts, input.recipients);
  if (!targets.length || targets.length > 10000) throw new Error("Pilih 1–10.000 penerima.");
  const sendingWindow = Math.ceil(targets.length / input.phoneIds.length) * input.delayMax * 1000;
  const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
  return targets.map((target, index) => {
    const recipient = normalizePhoneRecipient(target.number);
    const phoneId = input.phoneIds[index % input.phoneIds.length];
    const message = renderCampaignMessage(input.message, target);
    const sticker = input.messageType === "sticker";
    return { id: randomUUID(), userId, phoneId, campaignId: input.id, mediaId: input.mediaId || null, source: "WEB",
      storeId: "campaign", transactionId: input.id, messageKey: "campaign", recipient, message,
      ...(sticker ? { payload: { kind: "sticker" } } : {}),
      dedupeKey: hash([input.id, recipient]), payloadHash: hash(sticker ? [message, input.mediaId, { kind: "sticker" }] : [message, input.mediaId || null]),
      nextAttemptAt: start, expiresAt: new Date(Math.max(Date.now(), start.getTime()) + sendingWindow + 24 * 3600000) };
  });
}
