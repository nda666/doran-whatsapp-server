import type { NextApiResponse } from "next";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import type { AuthNextApiRequest } from "@/types/global";
import { prisma } from "@/lib/prisma";
import { templateInput } from "@/lib/messageTemplates";

async function handler(req: AuthNextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  const userId = req.user!.id;
  if (req.method === "GET") {
    const q = typeof req.query.q === "string" ? req.query.q.slice(0, 200) : "";
    const where = { userId, ...(q ? { OR: [{ name: { contains: q } }, { content: { contains: q } }] } : {}) };
    const page = Math.max(1, Math.min(10000, Number(req.query.page) || 1));
    const [data, total] = await Promise.all([
      prisma.messageTemplate.findMany({ where, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], skip: (Math.floor(page) - 1) * 20, take: 20 }),
      prisma.messageTemplate.count({ where }),
    ]);
    return res.json({ data, total });
  }
  if (req.method !== "POST") return res.status(405).end();
  const parsed = templateInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Nama wajib diisi (maks. 200 karakter), pesan 1–10.000 karakter." });
  return res.status(201).json(await prisma.messageTemplate.create({ data: { userId, ...parsed.data } }));
}
export default apiAuthMiddleware(handler);
