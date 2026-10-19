import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isApproved } from "@/lib/access";
import { authRateLimit, newResetToken, passwordResetUrl, postmarkServerToken, requestIp, RESET_TTL_MS, resetTokenHash, sendResetEmail, validAuthOrigin } from "@/server/passwordReset";

const input = z.object({ email: z.string().trim().email().max(200).transform(value => value.toLowerCase()) }).strict();
const responseMessage = "Jika email terdaftar pada akun aktif, tautan reset password akan dikirim. Periksa inbox dan folder spam.";
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).end(); }
  if (!validAuthOrigin(req)) return res.status(403).json({ message: "Permintaan tidak valid." });
  const parsed = input.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Masukkan email yang valid." });
  const { email } = parsed.data;
  try {
    if (!await authRateLimit("forgot-ip", requestIp(req), 20)) {
      res.setHeader("Retry-After", "900");
      return res.status(429).json({ message: "Terlalu banyak permintaan. Coba lagi dalam 15 menit." });
    }
    if (!await authRateLimit("forgot-email", email, 3)) return res.json({ message: responseMessage });
    const serverToken = await postmarkServerToken();
    const token = newResetToken();
    const link = passwordResetUrl(token);
    const user = await prisma.user.findUnique({ where: { email } });
    if (user && isApproved(user)) {
      const tokenHash = resetTokenHash(token);
      await prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
      await prisma.passwordResetToken.create({ data: { tokenHash, userId: user.id, email, sessionVersion: user.sessionVersion, passwordHash: resetTokenHash(user.password), expiresAt: new Date(Date.now() + RESET_TTL_MS) } });
      try { await sendResetEmail(email, user.name, link, serverToken); }
      catch {
        await prisma.passwordResetToken.deleteMany({ where: { tokenHash } });
        console.error("Password reset email could not be sent.");
      }
    }
    return res.json({ message: responseMessage });
  } catch {
    console.error("Password reset service unavailable.");
    return res.status(503).json({ message: "Layanan reset password sementara belum tersedia. Coba lagi nanti." });
  }
}
