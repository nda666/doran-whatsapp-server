import type { NextApiResponse } from "next";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import type { AuthNextApiRequest } from "@/types/global";
import { prisma } from "@/lib/prisma";
import { templateInput } from "@/lib/messageTemplates";

async function handler(req: AuthNextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  const where = { id: String(req.query.id), userId: req.user!.id };
  if (req.method === "PATCH") {
    const parsed = templateInput.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Nama atau isi pesan tidak valid." });
    const result = await prisma.messageTemplate.updateMany({ where, data: parsed.data });
    return result.count ? res.json({ success: true }) : res.status(404).json({ message: "Template tidak ditemukan." });
  }
  if (req.method === "DELETE") {
    const result = await prisma.messageTemplate.deleteMany({ where });
    return result.count ? res.json({ success: true }) : res.status(404).json({ message: "Template tidak ditemukan." });
  }
  return res.status(405).end();
}
export default apiAuthMiddleware(handler);
