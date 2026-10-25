import type { NextApiResponse } from "next";
import { z } from "zod";
import apiSuperAdminMiddleware from "@/middleware/apiSuperAdminMiddleware";
import type { AuthNextApiRequest } from "@/types/global";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/access";

// Access assignment only: transport ownership, sessions and history stay intact.
export default apiSuperAdminMiddleware(async (req: AuthNextApiRequest, res: NextApiResponse) => {
  res.setHeader("Cache-Control", "no-store");
  const id = z.string().uuid().safeParse(req.query.id);
  if (!id.success) return res.status(400).json({ message: "ID perangkat tidak valid." });
  if (req.method === "GET") {
    const q = typeof req.query.q === "string" ? req.query.q.slice(0, 200) : "";
    return res.json(await prisma.user.findMany({ where: { isActive: true, approvalStatus: "APPROVED", ...(q ? { OR: [{ name: { contains: q } }, { email: { contains: q } }] } : {}) }, select: { id: true, name: true, email: true }, orderBy: { email: "asc" }, take: 100 }));
  }
  if (req.method !== "POST") { res.setHeader("Allow", "GET, POST"); return res.status(405).end(); }
  const input = z.object({ userId: z.string().uuid().nullable(), expectedAssignedUserId: z.string().uuid().nullable() }).strict().safeParse(req.body);
  if (!input.success) return res.status(400).json({ message: "Pilih user tujuan yang valid." });
  try {
    const result = await prisma.$transaction(async tx => {
      const userId = input.data.userId;
      if (userId) {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
        const target = await tx.user.findFirst({ where: { id: userId, isActive: true, approvalStatus: "APPROVED" } });
        if (!target) throw new Error("Pilih user aktif yang sudah disetujui.");
        const count = await tx.phone.count({ where: { id: { not: id.data }, OR: [{ assignedUserId: userId }, { assignedUserId: null, userId }] } });
        if (!isSuperAdmin(target) && count >= target.deviceLimit) throw new Error("Limit perangkat user tujuan telah tercapai.");
      }
      const changed = await tx.phone.updateMany({ where: { id: id.data, assignedUserId: input.data.expectedAssignedUserId }, data: { assignedUserId: userId } });
      if (changed.count !== 1) throw new Error("Assignment sudah berubah atau perangkat tidak ditemukan. Muat ulang daftar perangkat.");
      return { id: id.data, assignedUserId: userId };
    });
    return res.json(result);
  } catch (error) { return res.status(409).json({ message: error instanceof Error && /^(Pilih|Limit|Assignment)/.test(error.message) ? error.message : "Assignment belum dapat disimpan." }); }
});
