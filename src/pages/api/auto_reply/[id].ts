import { prisma } from "@/lib/prisma";
import { phoneRecordScope as ownerScope } from "@/lib/access";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { AuthNextApiRequest } from "@/types/global";
import type { NextApiResponse } from "next";
async function handler(req: AuthNextApiRequest, res: NextApiResponse) {
  if (req.method !== "DELETE" && req.method !== "PATCH") {
    res.setHeader("Allow", "DELETE, PATCH");
    return res.status(405).end();
  }
  if (req.method === "PATCH") {
    const id = Number(req.query.id);
    if (!Number.isSafeInteger(id) || id <= 0 || typeof req.query.phone_id !== "string" || !req.query.phone_id) return res.status(400).json({ message: "ID balasan/perangkat tidak valid." });
    const status = req.body?.reply_status;
    if (status !== "active" && status !== "inactive") return res.status(400).json({ message: "Status balasan tidak valid." });
    const result = await prisma.autoReply.updateMany({
      where: { id, phoneId: req.query.phone_id, ...ownerScope(req.user!) },
      data: { reply_status: status },
    });
    if (!result.count) return res.status(404).json({ message: "Data tidak ditemukan." });
    return res.json({ result: true, reply_status: status });
  }
  const result = await prisma.autoReply.deleteMany({ where: { id: Number(req.query.id), phoneId: String(req.query.phone_id), ...ownerScope(req.user!) } });
  if (!result.count) return res.status(404).json({ message: "Data tidak ditemukan." });
  return res.json({ result: true });
}
export default apiAuthMiddleware(handler);
