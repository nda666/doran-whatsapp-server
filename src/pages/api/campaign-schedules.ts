import type { NextApiResponse } from "next";
import { z } from "zod";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { AuthNextApiRequest } from "@/types/global";
import { ownerScope } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { CampaignStatus } from "@prisma/client";
const query = z.object({ from: z.string().datetime({ offset: true }), to: z.string().datetime({ offset: true }), phoneId: z.string().uuid().optional(), status: z.nativeEnum(CampaignStatus).optional() });
export default apiAuthMiddleware(async (req: AuthNextApiRequest, res: NextApiResponse) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") {
    const parsed = query.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ message: "Rentang kalender tidak valid." });
    const q = parsed.data, from = new Date(q.from), to = new Date(q.to);
    if (to <= from || to.getTime() - from.getTime() > 93 * 86400000) return res.status(400).json({ message: "Rentang kalender maksimal 93 hari." });
    const campaigns = await prisma.campaign.findMany({ where: { ...ownerScope(req.user!), scheduledAt: { gte: from, lt: to }, ...(q.status ? { status: q.status } : {}), ...(q.phoneId ? { dispatches: { some: { phoneId: q.phoneId } } } : {}) }, orderBy: { scheduledAt: "asc" }, take: 1001, include: { _count: { select: { dispatches: true } } } });
    if (campaigns.length > 1000) return res.status(400).json({ message: "Terlalu banyak jadwal. Persempit rentang kalender." });
    return res.json(campaigns.map(c => ({ ...c, estimatedEnd: new Date(c.scheduledAt.getTime() + Math.ceil(c._count.dispatches / Math.max(1, (c.phoneIds as string[]).length)) * c.delayMax * 1000) })));
  }
  if (req.method !== "PATCH") return res.status(405).end();
  const parsed = z.object({ id: z.string().uuid(), scheduledAt: z.string().datetime({ offset: true }), updatedAt: z.string().datetime({ offset: true }) }).safeParse(req.body);
  if (!parsed.success || Date.parse(parsed.data.scheduledAt) < Date.now()) return res.status(400).json({ message: "Pilih jadwal di masa mendatang." });
  const input = parsed.data;
  try {
    await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM campaigns WHERE id = ${input.id} FOR UPDATE`;
      const c = await tx.campaign.findFirst({ where: { id: input.id, ...ownerScope(req.user!) } });
      if (!c || !["WAITING", "PAUSED"].includes(c.status) || c.updatedAt.getTime() !== Date.parse(input.updatedAt)) throw new Error("Jadwal sudah berubah atau campaign sudah berjalan. Muat ulang kalender.");
      if (await tx.waDispatch.count({ where: { campaignId: c.id, attempts: { gt: 0 } } })) throw new Error("Campaign yang sudah mulai dikirim tidak dapat dijadwalkan ulang.");
      const next = new Date(input.scheduledAt), shift = next.getTime() - c.scheduledAt.getTime();
      await tx.campaign.update({ where: { id: c.id }, data: { scheduledAt: next } });
      await tx.$executeRaw`UPDATE wa_dispatches SET nextAttemptAt = ${next}, expiresAt = TIMESTAMPADD(SECOND, ${Math.ceil(shift / 1000)}, expiresAt), updatedAt = NOW() WHERE campaignId = ${c.id} AND status = 'QUEUED'`;
    });
    return res.json({ success: true });
  } catch (error) { return res.status(409).json({ message: error instanceof Error ? error.message : "Jadwal gagal diubah." }); }
});
