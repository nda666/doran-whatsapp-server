import { updateDispatches } from "@/server/dispatchWebhook/events";
import type { NextApiResponse } from "next";
import { z } from "zod";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { AuthNextApiRequest } from "@/types/global";
import { prisma } from "@/lib/prisma";
import { normalizePhoneRecipient } from "@/utils/normalizePhoneRecipient";
export default apiAuthMiddleware(async (req: AuthNextApiRequest, res: NextApiResponse) => {
  res.setHeader("Cache-Control", "no-store");
  const userId = req.user!.id;
  if (req.method === "GET") {
    const page = Math.max(1, Math.min(100000, Number(req.query.page) || 1));
    const where = { userId, ...(typeof req.query.q === "string" ? { number: { contains: req.query.q.slice(0, 32) } } : {}) };
    const [data, total] = await Promise.all([prisma.recipientSuppression.findMany({ where, take: 50, skip: (page - 1) * 50, orderBy: { createdAt: "desc" } }), prisma.recipientSuppression.count({ where })]);
    return res.json({ data, total });
  }
  if (req.method === "POST") {
    const parsed = z.object({ numbers: z.array(z.string().max(40)).min(1).max(1000), reason: z.string().max(255).default("") }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Maksimal 1.000 nomor per impor." });
    let numbers: string[];
    try { numbers = Array.from(new Set(parsed.data.numbers.map(n => normalizePhoneRecipient(n)))); }
    catch { return res.status(400).json({ message: "Ada nomor tidak valid. Periksa semua nomor sebelum mengimpor." }); }
    await prisma.$transaction(async tx => {
      await tx.recipientSuppression.createMany({ data: numbers.map(number => ({ userId, number, reason: parsed.data.reason, source: numbers.length > 1 ? "IMPORT" : "MANUAL" })), skipDuplicates: true });
      await updateDispatches({ where: { userId, recipient: { in: numbers }, status: "QUEUED" }, data: { status: "SUPPRESSED", lastError: "RECIPIENT_OPTED_OUT" } }, tx);
    });
    return res.json({ message: `${numbers.length} nomor diproses.` });
  }
  if (req.method === "DELETE") {
    const parsed = z.object({ id: z.string().uuid(), consentConfirmed: z.literal(true) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Konfirmasikan bahwa penerima telah memberikan persetujuan baru." });
    await prisma.recipientSuppression.deleteMany({ where: { id: parsed.data.id, userId } });
    return res.json({ success: true });
  }
  return res.status(405).end();
});
