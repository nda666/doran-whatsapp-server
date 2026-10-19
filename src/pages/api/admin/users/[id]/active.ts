import type { NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/access";
import apiSuperAdminMiddleware from "@/middleware/apiSuperAdminMiddleware";
import { AuthNextApiRequest } from "@/types/global";
import { getSocketIO } from "@/server/libs/socket";

async function handler(req: AuthNextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "PATCH") return res.status(405).end();
  const parsed = z.object({ isActive: z.boolean() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Status aktif tidak valid." });
  const id = String(req.query.id);
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return res.status(404).end();
  if (!parsed.data.isActive && (id === req.user!.id || isSuperAdmin(target))) {
    return res.status(409).json({ message: "Administrator utama tidak dapat dinonaktifkan." });
  }
  await prisma.$transaction(async tx => {
    await tx.user.update({ where: { id }, data: {
      isActive: parsed.data.isActive,
      ...(!parsed.data.isActive ? { sessionVersion: { increment: 1 } } : {}),
    } });
    if (!parsed.data.isActive) await tx.session.deleteMany({ where: { userId: id } });
  });
  if (!parsed.data.isActive) {
    getSocketIO.to(id).emit("account:disabled");
    getSocketIO.in(id).disconnectSockets(true);
  }
  return res.json({ message: parsed.data.isActive ? "Pengguna diaktifkan. Login tetap memerlukan persetujuan admin." : "Pengguna dinonaktifkan dan seluruh sesi login diakhiri." });
}
export default apiSuperAdminMiddleware(handler);
