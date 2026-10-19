import type { NextApiResponse } from "next";
import bcrypt from "bcrypt";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import type { AuthNextApiRequest } from "@/types/global";
import { isApproved } from "@/lib/access";
import { authRateLimit, validAuthOrigin } from "@/server/passwordReset";
import { getSocketIO } from "@/server/libs/socket";

const passwordField = z.string().min(6, "Password minimal 6 karakter.").max(72)
  .refine(value => Buffer.byteLength(value, "utf8") <= 72, "Password maksimal 72 byte.");
const input = z.object({ currentPassword: passwordField, password: passwordField, passwordConfirm: z.string().max(72) }).strict()
  .refine(value => value.password === value.passwordConfirm, "Konfirmasi password tidak sama.")
  .refine(value => value.currentPassword !== value.password, "Password baru harus berbeda dari password saat ini.");

async function handler(req: AuthNextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).end(); }
  if (!validAuthOrigin(req)) return res.status(403).json({ message: "Permintaan tidak valid." });
  const parsed = input.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues.map(issue => issue.message).join(", ") });
  const user = req.user!;
  if (!await authRateLimit("change-password-user", user.id, 10)) {
    res.setHeader("Retry-After", "900");
    return res.status(429).json({ message: "Terlalu banyak percobaan. Coba lagi dalam 15 menit." });
  }
  if (!await bcrypt.compare(parsed.data.currentPassword, user.password)) return res.status(400).json({ message: "Password saat ini tidak sesuai." });
  const password = await bcrypt.hash(parsed.data.password, 12);
  const changed = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id} FOR UPDATE`;
    const current = await tx.user.findUnique({ where: { id: user.id } });
    if (!current || !isApproved(current) || current.password !== user.password || current.sessionVersion !== user.sessionVersion) return false;
    await tx.user.update({ where: { id: user.id }, data: { password, sessionVersion: { increment: 1 } } });
    await tx.session.deleteMany({ where: { userId: user.id } });
    await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
    return true;
  });
  if (!changed) return res.status(409).json({ message: "Akun atau password sudah berubah. Silakan login kembali." });
  try { getSocketIO.in(user.id).disconnectSockets(true); } catch { /* Session checks also reject revoked sessions. */ }
  return res.json({ message: "Password berhasil diubah. Silakan login kembali menggunakan password baru." });
}

export default apiAuthMiddleware(handler);
