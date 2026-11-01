import { prisma } from "@/lib/prisma";
import type { NextApiRequest, NextApiResponse } from "next";
import bcrypt from "bcrypt";
import { isApproved } from "@/lib/access";
import { authRateLimit, requestIp } from "@/server/passwordReset";
const attempts = new Map<string, { count: number; until: number }>();
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const { email, password } = req.body || {};
  if (typeof email !== "string" || typeof password !== "string" || !email.trim() || password.length < 6 || email.length > 254 || password.length > 1024) return res.status(400).json({ message: "Email dan password tidak valid; password minimal 6 karakter" });
  const account = email.trim().toLowerCase();
  const ip = requestIp(req);
  // Keyed by account and client so one attacker cannot lock a victim out from another address.
  const attemptKey = `${account}|${ip}`;
  const now = Date.now();
  attempts.forEach((state, key) => { if (state.until <= now) attempts.delete(key); });
  // Without a trusted proxy every NextAuth login shares the server's own address, so a per-address cap would throttle everyone.
  if (process.env.AUTH_TRUST_PROXY === "true") {
    try {
      if (!await authRateLimit("signin-ip", ip, 60)) {
        res.setHeader("Retry-After", "900");
        return res.status(429).json({ message: "Terlalu banyak percobaan login, coba lagi nanti" });
      }
    } catch { /* the in-memory limiter below still applies */ }
  }
  const state = attempts.get(attemptKey) || { count: 0, until: now + 15 * 60 * 1000 };
  if (state.count >= 10 || (attempts.size >= 5000 && !attempts.has(attemptKey))) {
    res.setHeader("Retry-After", "900");
    return res.status(429).json({ message: "Terlalu banyak percobaan login, coba lagi nanti" });
  }
  state.count++;
  attempts.set(attemptKey, state);
  try {
    const user = await prisma.user.findUnique({ where: { email: account } });
    if (!user || !await bcrypt.compare(password, user.password)) return res.status(401).json({ message: "Email atau password tidak valid" });
    if (!isApproved(user)) return res.status(403).json({ message: user.isActive === false ? "Akun tidak aktif. Hubungi admin." : user.approvalStatus === "PENDING" ? "Akun masih menunggu persetujuan admin." : "Pendaftaran akun ditolak. Hubungi admin." });
    attempts.delete(attemptKey);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ token: user.token, email: user.email, id: user.id, sessionVersion: user.sessionVersion });
  } catch (error) { return res.status(500).json({ message: "Login sementara tidak tersedia" }); }
}

