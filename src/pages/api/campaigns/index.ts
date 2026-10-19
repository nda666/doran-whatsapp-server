import { getDispatchDisplayWindow } from "@/server/dispatch/settings";
import { createDispatches } from "@/server/dispatchWebhook/events";
import { tableQuery } from "@/lib/tableQuery";
import { ownerScope } from "@/lib/access";
import type { NextApiResponse } from "next";
import { CampaignStatus } from "@prisma/client";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { AuthNextApiRequest } from "@/types/global";
import { prisma } from "@/lib/prisma";
import { campaignInput, campaignJobs, validCampaignMedia } from "@/server/campaigns/prepare";

async function handler(req: AuthNextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  const userId = req.user!.id;
  if (req.method === "GET") {
    const window = await getDispatchDisplayWindow();
    const { page, limit, skip, orderBy } = tableQuery(req.query, ["name", "status", "scheduledAt"], "createdAt", "desc");
    const status = Object.values(CampaignStatus).includes(req.query.status as CampaignStatus) ? req.query.status as CampaignStatus : undefined;
    const where = { ...ownerScope(req.user!), OR: [{ scheduledAt: { gte: window.start } }, { dispatches: { some: { createdAt: window.createdAt } } }], ...(typeof req.query.phoneId === "string" && req.query.phoneId ? { dispatches: { some: { phoneId: req.query.phoneId } } } : {}), ...(status ? { status } : {}) };
    const [data, total] = await Promise.all([prisma.campaign.findMany({ where, orderBy, skip, take: limit }), prisma.campaign.count({ where })]);
    const counts = await prisma.waDispatch.groupBy({ by: ["campaignId", "status"], where: { ...ownerScope(req.user!), campaignId: { in: data.map(c => c.id) } }, _count: { _all: true } });
    return res.json({ display_window: { days: window.days, start: window.start, end: window.end }, total, data: data.map(c => ({ ...c, counts: Object.fromEntries(counts.filter(n => n.campaignId === c.id).map(n => [n.status, n._count._all])) })) });
  }
  if (req.method !== "POST") return res.status(405).end();
  if (process.env.DISPATCH_QUEUE_ENABLED !== "true") return res.status(503).json({ message: "Aktifkan DISPATCH_QUEUE_ENABLED sebelum membuat campaign." });
  const parsed = campaignInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues.map(i => i.message).join(", ") });
  const input = parsed.data;
  const [phones, contacts, selectedContacts, groups, media] = await Promise.all([
    prisma.phone.findMany({ where: { ...ownerScope(req.user!), id: { in: input.phoneIds }, active: 1 }, select: { id: true } }),
    prisma.contact.findMany({ where: { ...ownerScope(req.user!), ...(input.allContacts ? {} : { OR: [{ groupId: { in: input.groupIds } }, { id: { in: input.contactIds } }] }) }, take: 10001 }),
    prisma.contact.count({ where: { ...ownerScope(req.user!), id: { in: input.contactIds } } }),
    prisma.contactGroup.count({ where: { ...ownerScope(req.user!), id: { in: input.groupIds } } }),
    input.mediaId ? prisma.mediaAsset.findFirst({ where: { id: input.mediaId, ...ownerScope(req.user!) } }) : null,
  ]);
  if (phones.length !== new Set(input.phoneIds).size || selectedContacts !== new Set(input.contactIds).size || groups !== new Set(input.groupIds).size || (input.mediaId && !media)) return res.status(400).json({ message: "Device, kontak, grup, atau media tidak tersedia." });
  if (!validCampaignMedia(input, media, userId)) return res.status(400).json({ message: "Pilih stiker WebP maksimal 100 KB milik Anda. Konversi foto melalui unggah stiker." });
  try {
    const jobs = campaignJobs(input, userId, contacts);
    const result = await prisma.$transaction(async tx => {
      // Serialize admission and duplicate retries for this owner.
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      const existing = await tx.campaign.findUnique({ where: { id: input.id } });
      if (existing) {
        if (existing.userId !== userId) throw new Error("ID campaign sudah digunakan.");
        const oldJobs = await tx.waDispatch.findMany({ where: { campaignId: input.id }, select: { dedupeKey: true, payloadHash: true, phoneId: true } });
        const byKey = new Map(oldJobs.map(j => [j.dedupeKey, j]));
        if ((input.scheduledAt && existing.scheduledAt.getTime() !== Date.parse(input.scheduledAt)) || existing.name !== input.name || existing.delayMin !== input.delayMin || existing.delayMax !== input.delayMax || oldJobs.length !== jobs.length || jobs.some(j => byKey.get(j.dedupeKey)?.payloadHash !== j.payloadHash || byKey.get(j.dedupeKey)?.phoneId !== j.phoneId)) throw new Error("ID campaign sudah digunakan dengan isi berbeda.");
        return existing;
      }
      if (await tx.waDispatch.count({ where: { status: { in: ["QUEUED", "PROCESSING"] } } }) + jobs.length > 100000) throw new Error("Antrean penuh.");
      const campaign = await tx.campaign.create({ data: { id: input.id, userId, name: input.name, message: input.message, phoneIds: input.phoneIds, audience: { messageType: input.messageType, recipients: input.recipients, groupIds: input.groupIds, contactIds: input.contactIds, allContacts: input.allContacts },
        mediaId: input.mediaId, scheduledAt: jobs[0].nextAttemptAt, delayMin: input.delayMin, delayMax: input.delayMax } });
      await tx.waSenderLease.createMany({ data: phones.map(p => ({ phoneId: p.id })), skipDuplicates: true });
      await createDispatches(tx, { data: jobs });
      return campaign;
    }, { timeout: 30000 });
    return res.status(201).json(result);
  } catch (error) { return res.status(400).json({ message: error instanceof Error ? error.message : "Campaign gagal dibuat" }); }
}
export default apiAuthMiddleware(handler);
export const config = { api: { bodyParser: { sizeLimit: "3mb" } } };
