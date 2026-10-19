import type { NextApiResponse } from "next";
import bcrypt from "bcrypt";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { isSuperAdmin, SUPER_ADMIN_EMAIL } from "@/lib/access";
import type { AuthNextApiRequest } from "@/types/global";

const select = { id: true, name: true, email: true, token: true };
const input = z.object({
  name: z.string().trim().min(1, "Nama wajib diisi.").max(200),
  email: z.string().trim().email("Email tidak valid.").max(200).transform(value => value.toLowerCase()),
  currentPassword: z.string().min(6, "Password minimal 6 karakter.").max(72).refine(value => Buffer.byteLength(value, "utf8") <= 72, "Password maksimal 72 byte.").optional(),
}).strict();

async function handler(req: AuthNextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  const user = req.user!;
  if (req.method === "GET") {
    return res.json({ id: user.id, name: user.name, email: user.email, token: user.token });
  }
  if (req.method !== "PATCH") {
    res.setHeader("Allow", "GET, PATCH");
    return res.status(405).end();
  }
  const parsed = input.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues.map(issue => issue.message).join(", ") });
  const { name, email, currentPassword } = parsed.data;
  const emailChanged = email !== user.email;
  if (emailChanged) {
    if (isSuperAdmin(user) || email === SUPER_ADMIN_EMAIL) {
      return res.status(409).json({ message: "Email administrator utama tidak dapat diubah atau digunakan akun lain." });
    }
    if (!currentPassword || !await bcrypt.compare(currentPassword, user.password)) {
      return res.status(400).json({ message: "Password saat ini tidak sesuai." });
    }
  }
  try {
    const profile = await prisma.user.update({
      where: { id: user.id },
      data: { name, ...(emailChanged ? { email, emailVerified: null } : {}) },
      select,
    });
    return res.json(profile);
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
      return res.status(409).json({ message: "Email sudah digunakan akun lain." });
    }
    throw error;
  }
}

export default apiAuthMiddleware(handler);
