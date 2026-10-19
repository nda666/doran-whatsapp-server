import { isSuperAdmin, ownerScope } from "@/lib/access";
import type { NextApiResponse } from "next";
import { z } from "zod";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { AuthNextApiRequest } from "@/types/global";
import { prisma } from "@/lib/prisma";
async function handler(req: AuthNextApiRequest, res: NextApiResponse) {
  const userId = req.user!.id; res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") return res.json(await prisma.contactGroup.findMany({ where: { ...ownerScope(req.user!) }, include: { _count: { select: { contacts: true } } }, orderBy: { name: "asc" }, take: 1000 }));
  if (req.method === "DELETE") return res.json(await prisma.contactGroup.deleteMany({ where: { ...ownerScope(req.user!), id: String(req.body.id) } }));
  if (req.method !== "POST") return res.status(405).end();
  const parsed = z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1).max(200) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).end();
  if (parsed.data.id) return res.json(await prisma.contactGroup.updateMany({ where: { ...ownerScope(req.user!), id: parsed.data.id }, data: { name: parsed.data.name } }));
  if (!isSuperAdmin(req.user!) && await prisma.contactGroup.count({ where: { userId } }) >= 1000) return res.status(400).json({ message: "Maksimal 1.000 grup." });
  try { return res.json(await prisma.contactGroup.create({ data: { userId, name: parsed.data.name } })); }
  catch { return res.status(409).json({ message: "Nama grup sudah digunakan." }); }
}
export default apiAuthMiddleware(handler);
