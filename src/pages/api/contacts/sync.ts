import { ownerScope } from "@/lib/access";
import type { NextApiResponse } from "next";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { AuthNextApiRequest } from "@/types/global";
import { prisma } from "@/lib/prisma";
async function handler(req: AuthNextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const phoneId = String(req.body.phoneId), groupId = req.body.groupId || null;
  const phone = await prisma.phone.findFirst({ where: { id: phoneId, ...ownerScope(req.user!) } });
  if (!phone) return res.status(404).json({ message: "Device tidak ditemukan atau tidak dapat diakses." });
  const userId = phone.userId;
  if (groupId && !await prisma.contactGroup.findFirst({ where: { id: groupId, userId } })) return res.status(404).json({ message: "Grup tujuan tidak ditemukan atau tidak dapat diakses." });
  const rows = await prisma.deviceContact.findMany({ where: { phoneId, userId }, take: 10000 });
  if (!rows.length) return res.json({ found: 0, count: 0, skipped: 0 });
  const result = await prisma.contact.createMany({ data: rows.map(r => ({ userId, number: r.number, name: r.name, groupId })), skipDuplicates: true });
  return res.json({ found: rows.length, count: result.count, skipped: rows.length - result.count });
}
export default apiAuthMiddleware(handler);
