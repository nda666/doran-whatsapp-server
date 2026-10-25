import type { NextApiResponse } from "next";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { AuthNextApiRequest } from "@/types/global";
import { prisma } from "@/lib/prisma";
import { phoneScope as ownerScope } from "@/lib/access";
import { z } from "zod";

export default apiAuthMiddleware(async (req: AuthNextApiRequest, res: NextApiResponse) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).end();
  const query = z.object({ phone_id: z.string().uuid(), q: z.string().max(200).optional(), archived: z.enum(["0", "1"]).optional(), page: z.coerce.number().int().min(1).max(10000).default(1) }).safeParse(req.query);
  if (!query.success) return res.status(400).json({ message: "Pilih perangkat yang valid." });
  const { phone_id: phoneId, q, archived, page } = query.data;
  const phone = await prisma.phone.findFirst({ where: { id: phoneId, ...ownerScope(req.user!) }, select: { id: true, userId: true, name: true, number: true, active: true, isOnline: true, saveIncomingMessages: true } });
  if (!phone) return res.status(404).json({ message: "Perangkat tidak ditemukan." });
  const where = { phoneId, userId: phone.userId,
    archived: archived === "1", ...(q ? { OR: [{ name: { contains: q } }, { jid: { contains: q } }, { messages: { some: { text: { contains: q } } } }] } : {}) };
  const [data, total] = await Promise.all([
    prisma.chatConversation.findMany({ where, orderBy: [{ lastMessageAt: "desc" }, { id: "desc" }], skip: (page - 1) * 40, take: 40 }),
    prisma.chatConversation.count({ where }),
  ]);
  return res.json({ data, total, page, phone });
});
