import { prisma } from "@/lib/prisma";
import type { NextApiRequest, NextApiResponse } from "next";
import bcrypt from "bcrypt";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { SUPER_ADMIN_EMAIL } from "@/lib/access";
const input = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(200).transform(value => value.toLowerCase()),
  password: z.string().min(6, "Kata sandi minimal 6 karakter.").max(72).refine(value => Buffer.byteLength(value, "utf8") <= 72, "Password maksimal 72 byte."),
  passwordConfirm: z.string(),
}).refine(value => value.password === value.passwordConfirm, "Konfirmasi password tidak sama.");
const attempts = new Map<string, number>();
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).end();
  const parsed = input.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues.map(issue => issue.message).join(", ") });
  const { name, email, password } = parsed.data;
  if (email === SUPER_ADMIN_EMAIL) return res.status(409).json({ message: "Email ini khusus untuk akun administrator." });
  const now = Date.now();
  attempts.forEach((until, key) => { if (until <= now) attempts.delete(key); });
  if (attempts.has(email) || attempts.size >= 5000) {
    res.setHeader("Retry-After", "60");
    return res.status(429).json({ message: "Tunggu sebentar sebelum mengulangi pendaftaran." });
  }
  attempts.set(email, now + 60000);
  try {
    const plan = await prisma.subscriptionPlan.findUniqueOrThrow({ where: { name: "Standard" } });
    await prisma.user.create({ data: { name, email, password: await bcrypt.hash(password, 12), token: randomUUID(), role: "USER", approvalStatus: "PENDING", plan: plan.name, deviceLimit: plan.deviceLimit } });
    return res.status(201).json({ message: "Pendaftaran berhasil. Tunggu persetujuan admin sebelum masuk.", approvalStatus: "PENDING" });
  } catch (error: any) {
    if (error?.code === "P2002") return res.status(409).json({ message: "Email sudah terdaftar. Hubungi admin jika akun masih menunggu persetujuan." });
    return res.status(500).json({ message: "Pendaftaran belum berhasil. Silakan coba lagi." });
  }
}
