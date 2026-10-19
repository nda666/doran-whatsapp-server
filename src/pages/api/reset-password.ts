import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import { isApproved } from "@/lib/access";
import { authRateLimit, requestIp, resetTokenHash, validAuthOrigin } from "@/server/passwordReset";
import { getSocketIO } from "@/server/libs/socket";

const input = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/),
  password: z.string().min(6, "Password minimal 6 karakter.").max(72).refine(value => Buffer.byteLength(value, "utf8") <= 72, "Password maksimal 72 byte."),
  passwordConfirm: z.string().max(72),
}).strict().refine(value => value.password === value.passwordConfirm, "Konfirmasi password tidak sama.");
const invalid = "Tautan reset tidak valid atau sudah kedaluwarsa. Minta tautan baru melalui Lupa password.";
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).end(); }
  if (!validAuthOrigin(req)) return res.status(403).json({ message: "Permintaan tidak valid." });
  const parsed = input.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues.some(issue => issue.path.includes("token")) ? invalid : parsed.error.issues.map(issue => issue.message).join(", ") });
  try {
    if (!await authRateLimit("reset-ip", requestIp(req), 30)) { res.setHeader("Retry-After", "900"); return res.status(429).json({ message: "Terlalu banyak percobaan. Coba lagi dalam 15 menit." }); }
    const tokenHash = resetTokenHash(parsed.data.token);
    const reset = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!reset || reset.expiresAt <= new Date()) return res.status(400).json({ message: invalid });
    const password = await bcrypt.hash(parsed.data.password, 12);
    const userId = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${reset.userId} FOR UPDATE`;
      const current = await tx.passwordResetToken.findUnique({ where: { tokenHash } });
      const user = await tx.user.findUnique({ where: { id: reset.userId } });
      if (!current || current.expiresAt <= new Date() || !user || !isApproved(user) || user.email !== current.email || user.sessionVersion !== current.sessionVersion || resetTokenHash(user.password) !== current.passwordHash) return null;
      await tx.user.update({ where: { id: user.id }, data: { password, sessionVersion: { increment: 1 } } });
      await tx.session.deleteMany({ where: { userId: user.id } });
      await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
      return user.id;
    });
    if (!userId) return res.status(400).json({ message: invalid });
    try { getSocketIO.in(userId).disconnectSockets(true); } catch { /* Session checks also revoke existing sessions. */ }
    return res.json({ message: "Password berhasil diubah. Silakan login menggunakan password baru." });
  } catch {
    console.error("Password reset could not be completed.");
    return res.status(503).json({ message: "Password belum dapat diubah. Coba lagi nanti." });
  }
}
