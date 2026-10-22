import type { NextApiResponse } from "next";
import { z } from "zod";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import type { AuthNextApiRequest } from "@/types/global";
import { ownerScope } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { reassignmentWhere, replacementQuota } from "@/server/dispatch/reassignment";
import { senderNumber } from "@/server/dispatch/senderNumberMembership";

async function handler(req: AuthNextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).end();
  }
  const source = await prisma.phone.findFirst({ where: { id: String(req.query.id), ...ownerScope(req.user!) } });
  if (!source) return res.status(404).json({ message: "Perangkat tidak ditemukan." });
  if (process.env.DISPATCH_QUEUE_ENABLED !== "true") return res.status(409).json({ message: "Antrean pengiriman belum aktif." });
  if (req.method === "GET") {
    const phones = await prisma.phone.findMany({ where: { userId: source.userId, id: { not: source.id }, active: 1 }, orderBy: [{ name: "asc" }, { id: "asc" }] });
    const options = [];
    for (const phone of phones) {
      if (senderNumber(phone.number) && senderNumber(phone.number) === senderNumber(source.number)) continue;
      const quota = await replacementQuota(phone);
      if (quota) options.push({ id: phone.id, name: phone.name, number: phone.number, ...quota });
    }
    const count = await prisma.waDispatch.count({ where: await reassignmentWhere(source) });
    return res.json({ count, options });
  }
  const input = z.object({ targetPhoneId: z.string().uuid() }).strict().safeParse(req.body);
  if (!input.success) return res.status(400).json({ message: "Pilih nomor pengganti yang valid." });
  const target = await prisma.phone.findFirst({ where: { id: input.data.targetPhoneId, userId: source.userId } });
  if (!target || target.id === source.id || (senderNumber(target.number) && senderNumber(target.number) === senderNumber(source.number))) {
    return res.status(400).json({ message: "Nomor pengganti harus berbeda dan berasal dari pemilik yang sama." });
  }
  if (!await replacementQuota(target)) return res.status(409).json({ message: "Nomor pengganti sudah tidak tersedia, tidak sehat, atau kuotanya habis. Muat ulang daftar nomor." });
  // One conditional UPDATE races safely with worker claims: processing rows and
  // rows whose assignment changed are never overwritten. No age/backoff is reset.
  const result = await prisma.waDispatch.updateMany({ where: await reassignmentWhere(source),
    data: { senderPhoneId: target.id, senderGroupId: null, lastError: null } });
  return res.json({ count: result.count });
}
export default apiAuthMiddleware(handler);
