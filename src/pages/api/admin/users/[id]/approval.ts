import type { NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/access";
import apiSuperAdminMiddleware from "@/middleware/apiSuperAdminMiddleware";
import { AuthNextApiRequest } from "@/types/global";
import { getSocketIO } from "@/server/libs/socket";
import { suspendOwnedWaSessions } from "@/server/libs/makeWASocket";

async function handler(req: AuthNextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "PATCH") return res.status(405).end();
  const parsed = z.object({ approvalStatus: z.enum(["APPROVED", "REJECTED"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Status persetujuan tidak valid." });
  const target = await prisma.user.findUnique({ where: { id: String(req.query.id) } });
  if (!target) return res.status(404).end();
  if (isSuperAdmin(target) || target.id === req.user!.id) return res.status(409).json({ message: "Status akun administrator ini tidak dapat diubah." });
  await prisma.$transaction(async tx => {
    await tx.user.update({ where: { id: target.id }, data: { approvalStatus: parsed.data.approvalStatus,
      ...(parsed.data.approvalStatus === "REJECTED" ? { sessionVersion: { increment: 1 } } : {}) } });
    if (parsed.data.approvalStatus === "REJECTED") await tx.session.deleteMany({ where: { userId: target.id } });
  });
  if (parsed.data.approvalStatus === "REJECTED") {
    getSocketIO.in(target.id).disconnectSockets(true);
    await suspendOwnedWaSessions(target.id).catch(() => console.error("WA_ACCOUNT_SUSPEND_FAILED", target.id));
  }
  return res.json({ message: parsed.data.approvalStatus === "APPROVED" ? "Pengguna disetujui dan dapat masuk." : "Pendaftaran pengguna ditolak." });
}
export default apiSuperAdminMiddleware(handler);
