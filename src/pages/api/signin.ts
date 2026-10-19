import { prisma } from "@/lib/prisma";
import type { NextApiRequest, NextApiResponse } from "next";
import bcrypt from "bcrypt";
import { isApproved } from "@/lib/access";
const attempts = new Map<string, { count: number; until: number }>();
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const { email, password } = req.body || {};
  if (typeof email !== "string" || typeof password !== "string" || !email.trim() || password.length < 6 || email.length > 254 || password.length > 1024) return res.status(400).json({ message: "Email dan password tidak valid; password minimal 6 karakter" });
  const account = email.trim().toLowerCase();
  const now = Date.now();
  attempts.forEach((state, key) => { if (state.until <= now) attempts.delete(key); });
  const state = attempts.get(account) || { count: 0, until: now + 15 * 60 * 1000 };
  if (state.count >= 10 || (attempts.size >= 5000 && !attempts.has(account))) {
    res.setHeader("Retry-After", "900");
    return res.status(429).json({ message: "Terlalu banyak percobaan login, coba lagi nanti" });
  }
  state.count++;
  attempts.set(account, state);
  try {
    const user = await prisma.user.findUnique({ where: { email: account } });
    if (!user || !await bcrypt.compare(password, user.password)) return res.status(401).json({ message: "Email atau password tidak valid" });
    if (!isApproved(user)) return res.status(403).json({ message: user.isActive === false ? "Akun tidak aktif. Hubungi admin." : user.approvalStatus === "PENDING" ? "Akun masih menunggu persetujuan admin." : "Pendaftaran akun ditolak. Hubungi admin." });
    attempts.delete(account);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ token: user.token, email: user.email, id: user.id, sessionVersion: user.sessionVersion });
  } catch (error) { return res.status(500).json({ message: "Login sementara tidak tersedia" }); }
}

