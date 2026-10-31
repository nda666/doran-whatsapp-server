import type { NextApiResponse } from "next";
import { z } from "zod";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import type { AuthNextApiRequest } from "@/types/global";
import { prisma } from "@/lib/prisma";
import { normalizePhoneRecipient } from "@/utils/normalizePhoneRecipient";
import { updateDispatches } from "@/server/dispatchWebhook/events";

const grant = z.object({ number: z.string().max(40), purpose: z.enum(["ORDER_UPDATES", "MARKETING", "SUPPORT"]),
  source: z.string().trim().min(1).max(100), evidence: z.string().trim().min(5).max(1000),
  grantedAt: z.string().datetime({ offset: true }), consentConfirmed: z.literal(true),
  resumeAfterOptOut: z.boolean().default(false) }).strict();
export default apiAuthMiddleware(async (req: AuthNextApiRequest, res: NextApiResponse) => {
  res.setHeader("Cache-Control", "no-store");
  const userId = req.user!.id;
  if (req.method === "GET") {
    const page = Math.max(1, Math.min(100000, Number(req.query.page) || 1));
    const where = { userId, ...(typeof req.query.q === "string" ? { number: { contains: req.query.q.slice(0, 32) } } : {}) };
    const [data, total] = await Promise.all([
      prisma.recipientConsent.findMany({ where, take: 50, skip: (page - 1) * 50, orderBy: { updatedAt: "desc" } }),
      prisma.recipientConsent.count({ where }),
    ]);
    return res.json({ data, total, page });
  }
  if (req.method === "POST") {
    const parsed = grant.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Isi nomor, kategori, sumber, waktu, bukti izin, dan konfirmasi persetujuan penerima." });
    const { purpose, source, evidence, resumeAfterOptOut } = parsed.data;
    let number: string;
    try { number = normalizePhoneRecipient(parsed.data.number); } catch { return res.status(400).json({ message: "Nomor tidak valid." }); }
    const grantedAt = new Date(parsed.data.grantedAt);
    if (grantedAt.getTime() > Date.now()) return res.status(400).json({ message: "Waktu izin tidak boleh berada di masa depan." });
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      const suppressed = await tx.recipientSuppression.findUnique({ where: { userId_number: { userId, number } } });
      if (suppressed && (!resumeAfterOptOut || grantedAt <= suppressed.createdAt)) return null;
      const data = { source, evidence, grantedAt, revokedAt: null };
      const consent = await tx.recipientConsent.upsert({ where: { userId_number_purpose: { userId, number, purpose } },
        create: { userId, number, purpose, ...data }, update: data });
      await tx.recipientConsentEvent.create({ data: { userId, number, purpose, source, evidence, action: "GRANTED", occurredAt: grantedAt } });
      if (suppressed) await tx.recipientSuppression.deleteMany({ where: { id: suppressed.id, userId } });
      // Previously suppressed jobs stay suppressed; a new request is required.
      return consent;
    });
    if (!result) return res.status(409).json({ message: "Penerima pernah berhenti. Catat izin baru setelah waktu berhenti dan konfirmasikan pembukaan blokir." });
    return res.status(201).json(result);
  }
  if (req.method === "DELETE") {
    const parsed = z.object({ number: z.string().max(40), reason: z.string().trim().min(1).max(255) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Isi nomor dan alasan pencabutan izin." });
    let number: string;
    try { number = normalizePhoneRecipient(parsed.data.number); } catch { return res.status(400).json({ message: "Nomor tidak valid." }); }
    const now = new Date();
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      await tx.recipientConsent.updateMany({ where: { userId, number, revokedAt: null }, data: { revokedAt: now } });
      await tx.recipientConsentEvent.create({ data: { userId, number, purpose: "ALL", action: "REVOKED", source: "MANUAL", evidence: parsed.data.reason, occurredAt: now } });
      await tx.recipientSuppression.upsert({ where: { userId_number: { userId, number } }, create: { userId, number, reason: parsed.data.reason, source: "CONSENT_REVOKED" }, update: { reason: parsed.data.reason, source: "CONSENT_REVOKED", createdAt: now } });
      await updateDispatches({ where: { userId, recipient: number, status: "QUEUED" }, data: { status: "SUPPRESSED", lastError: "RECIPIENT_OPTED_OUT" } }, tx);
    });
    return res.json({ success: true });
  }
  return res.status(405).end();
});
