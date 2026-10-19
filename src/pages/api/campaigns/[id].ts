import { createDispatches, updateDispatches } from "@/server/dispatchWebhook/events";
import { tableQuery } from "@/lib/tableQuery";
import { ownerScope } from "@/lib/access";
import type { NextApiResponse } from "next";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { AuthNextApiRequest } from "@/types/global";
import { prisma } from "@/lib/prisma";
import { campaignInput, campaignJobs, validCampaignMedia } from "@/server/campaigns/prepare";
async function handler(req: AuthNextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  const id = String(req.query.id), userId = req.user!.id;
  const campaign = await prisma.campaign.findFirst({ where: { id, ...ownerScope(req.user!) } });
  if (!campaign) return res.status(404).end();
  if (req.method === "GET") {
    const { page, limit, skip, orderBy } = tableQuery(req.query, ["recipient", "phoneId", "status", "lastError", "sentAt"], "createdAt", "asc");
    const [data, total] = await Promise.all([prisma.waDispatch.findMany({ where: { campaignId: id, ...ownerScope(req.user!) }, skip, take: limit,
      orderBy, select: { id: true, recipient: true, phoneId: true, status: true, lastError: true, sentAt: true } }), prisma.waDispatch.count({ where: { campaignId: id, ...ownerScope(req.user!) } })]);
    return res.json({ campaign, data, total });
  }
  if (req.method !== "PATCH") return res.status(405).end();
  const action = req.body.action;
  if (action === "edit") {
    const parsed = campaignInput.safeParse({ ...req.body, id });
    if (!parsed.success) return res.status(400).json({ message: parsed.error.issues.map(issue => issue.message).join(", ") });
    const input = parsed.data;
    const [phones, contacts, selectedContacts, groups, media] = await Promise.all([
      prisma.phone.findMany({ where: { ...ownerScope(req.user!), id: { in: input.phoneIds }, active: 1 }, select: { id: true } }),
      prisma.contact.findMany({ where: { ...ownerScope(req.user!), ...(input.allContacts ? {} : { OR: [{ groupId: { in: input.groupIds } }, { id: { in: input.contactIds } }] }) }, take: 10001 }),
      prisma.contact.count({ where: { ...ownerScope(req.user!), id: { in: input.contactIds } } }),
      prisma.contactGroup.count({ where: { ...ownerScope(req.user!), id: { in: input.groupIds } } }),
      input.mediaId ? prisma.mediaAsset.findFirst({ where: { id: input.mediaId, ...ownerScope(req.user!) } }) : null,
    ]);
    if (phones.length !== new Set(input.phoneIds).size || selectedContacts !== new Set(input.contactIds).size || groups !== new Set(input.groupIds).size || (input.mediaId && !media)) return res.status(400).json({ message: "Device, kontak, grup, atau media tidak tersedia." });
    if (!validCampaignMedia(input, media, campaign.userId)) return res.status(400).json({ message: "Pilih stiker WebP maksimal 100 KB milik pemilik campaign. Konversi foto melalui unggah stiker." });
    // Workers lock this same campaign before claiming a recipient, so editing cannot race a send.
    try {
      const updated = await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${campaign.userId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM campaigns WHERE id = ${id} FOR UPDATE`;
        const current = await tx.campaign.findUniqueOrThrow({ where: { id } });
        if (!["WAITING", "PAUSED"].includes(current.status) || await tx.waDispatch.count({ where: { campaignId: id, OR: [{ status: { not: "QUEUED" } }, { attempts: { gt: 0 } }] } })) throw new Error("Campaign hanya dapat diedit sebelum penerima mulai dikirim. Jeda campaign terlebih dahulu.");
        if (media && media.userId !== current.userId) {
          const owner = await tx.user.findUniqueOrThrow({ where: { id: current.userId } });
          if (owner.email !== "admin@gmail.com" || owner.role !== "ADMIN") throw new Error("Media harus milik pemilik campaign.");
        }
        const jobs = campaignJobs(input, current.userId, contacts);
        const queued = await tx.waDispatch.count({ where: { status: { in: ["QUEUED", "PROCESSING"] }, OR: [{ campaignId: null }, { campaignId: { not: id } }] } });
        if (queued + jobs.length > 100000) throw new Error("Antrean penuh.");
        await tx.waDispatch.deleteMany({ where: { campaignId: id } });
        await tx.waSenderLease.createMany({ data: phones.map(phone => ({ phoneId: phone.id })), skipDuplicates: true });
        await createDispatches(tx, { data: jobs });
        return tx.campaign.update({ where: { id }, data: { name: input.name, message: input.message, phoneIds: input.phoneIds, mediaId: input.mediaId || null, scheduledAt: jobs[0].nextAttemptAt, delayMin: input.delayMin, delayMax: input.delayMax, audience: { messageType: input.messageType, recipients: input.recipients, groupIds: input.groupIds, contactIds: input.contactIds, allContacts: input.allContacts } } });
      }, { timeout: 30000 });
      return res.json(updated);
    } catch (error) { return res.status(409).json({ message: error instanceof Error ? error.message : "Campaign gagal diperbarui." }); }
  }
  if (!["pause", "resume", "clear"].includes(action)) return res.status(400).end();
  const result = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM campaigns WHERE id = ${id} FOR UPDATE`;
    const current = await tx.campaign.findUniqueOrThrow({ where: { id } });
    if (["CLEARED", "COMPLETED"].includes(current.status)) return current;
    if (action === "clear") await updateDispatches({ where: { campaignId: id, status: "QUEUED" }, data: { status: "FAILED", lastError: "CAMPAIGN_CLEARED" } }, tx);
    if (action === "resume") {
      const pending = await tx.waDispatch.groupBy({ by: ["phoneId"], where: { campaignId: id, status: "QUEUED" }, _count: { _all: true } });
      const sendingWindow = Math.max(0, ...pending.map(p => p._count._all)) * current.delayMax * 1000;
      await tx.waDispatch.updateMany({ where: { campaignId: id, status: "QUEUED" }, data: { expiresAt: new Date(Math.max(Date.now(), current.scheduledAt.getTime()) + sendingWindow + 86400000) } });
    }
    return tx.campaign.update({ where: { id }, data: { status: action === "pause" ? "PAUSED" : action === "clear" ? "CLEARED" : "WAITING" } });
  });
  return res.json(result);
}
export default apiAuthMiddleware(handler);
export const config = { api: { bodyParser: { sizeLimit: "3mb" } } };
