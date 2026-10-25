import { ownerScope, phoneScope, campaignScope } from "@/lib/access";
import type { NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { AuthNextApiRequest } from "@/types/global";
async function handler(req: AuthNextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();
  res.setHeader("Cache-Control", "no-store");
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 200) : "";
  if (!q) return res.json({ data: [] });
  const [phones, contacts, campaigns, media] = await Promise.all([
    prisma.phone.findMany({ where: { ...phoneScope(req.user!), OR: [{ name: { contains: q } }, { number: { contains: q } }] }, select: { id: true, name: true, number: true }, take: 10 }),
    prisma.contact.findMany({ where: { ...ownerScope(req.user!), OR: [{ name: { contains: q } }, { number: { contains: q } }] }, select: { id: true, name: true, number: true }, take: 10 }),
    prisma.campaign.findMany({ where: { ...campaignScope(req.user!), name: { contains: q } }, select: { id: true, name: true }, take: 10 }),
    prisma.mediaAsset.findMany({ where: { ...ownerScope(req.user!), name: { contains: q } }, select: { id: true, name: true }, take: 10 }),
  ]);
  return res.json({ data: [...phones.map(p => ({ ...p, type: "Device", url: `/dashboard/phone` })), ...contacts.map(c => ({ ...c, type: "Kontak", url: `/dashboard/contacts?q=${encodeURIComponent(q)}` })), ...campaigns.map(c => ({ ...c, type: "Campaign", url: "/dashboard/campaigns" })), ...media.map(m => ({ ...m, type: "Media", url: "/dashboard/media" }))] });
}
export default apiAuthMiddleware(handler);
