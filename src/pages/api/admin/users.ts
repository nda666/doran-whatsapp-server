import { tableQuery } from "@/lib/tableQuery";
import type { NextApiResponse } from "next";
import { z } from "zod";
import bcrypt from "bcrypt";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import apiSuperAdminMiddleware from "@/middleware/apiSuperAdminMiddleware";
import { AuthNextApiRequest } from "@/types/global";
import { isSuperAdmin, SUPER_ADMIN_EMAIL } from "@/lib/access";
import { getSocketIO } from "@/server/libs/socket";
const select = { id: true, name: true, email: true, token: true, role: true, approvalStatus: true, isActive: true, deviceLimit: true, plan: true, subscriptionExpiresAt: true, _count: { select: { phones: true } } };
async function handler(req: AuthNextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") {
    const { page, limit, skip, orderBy } = tableQuery(req.query, {"name": "name", "email": "email", "role": "role", "approvalStatus": "approvalStatus", "deviceLimit": "deviceLimit", "plan": "plan", "_count.phones": "phones._count"}, "createdAt", "desc");
    const q = typeof req.query.q === "string" ? req.query.q.slice(0, 200) : "";
    const status = ["PENDING", "APPROVED", "REJECTED"].includes(String(req.query.status)) ? String(req.query.status) : undefined;
    const active = req.query.active;
    if (active !== undefined && active !== "" && active !== "true" && active !== "false") return res.status(400).json({ message: "Filter status user tidak valid." });
    const where = { ...(q ? { OR: [{ name: { contains: q } }, { email: { contains: q } }] } : {}), ...(status ? { approvalStatus: status } : {}), ...(active === "true" || active === "false" ? { isActive: active === "true" } : {}) };
    const [data, total] = await Promise.all([prisma.user.findMany({ where, select, take: limit, skip, orderBy }), prisma.user.count({ where })]);
    return res.json({ data, total });
  }
  if (req.method !== "POST") return res.status(405).end();
  const parsed = z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1).max(200), email: z.string().trim().email().max(200).transform(v => v.toLowerCase()),
    password: z.string().min(6, "Password minimal 6 karakter.").max(72).refine(v => Buffer.byteLength(v, "utf8") <= 72, "Password maksimal 72 byte.").optional(), isActive: z.boolean().optional(), role: z.enum(["ADMIN", "USER"]), deviceLimit: z.number().int().min(0).max(10000), plan: z.string().trim().min(1).max(100), subscriptionExpiresAt: z.string().datetime().nullable().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: parsed.error.issues.map(i => i.message).join(", ") });
  const { id, password, ...data } = parsed.data;
  if (id === req.user!.id && data.role !== "ADMIN") return res.status(409).json({ message: "Anda tidak dapat menghapus role admin sendiri." });
  try {
    const selectedPlan = await prisma.subscriptionPlan.findUnique({ where: { name: data.plan } });
    const previousUser = id ? await prisma.user.findUnique({ where: { id } }) : null;
    if (!selectedPlan || (!selectedPlan.active && previousUser?.plan !== data.plan)) return res.status(400).json({ message: "Pilih paket aktif dari Master Paket." });
    if (id) {
      const target = await prisma.user.findUnique({ where: { id } });
      if (!target) return res.status(404).end();
      if (data.isActive === false && (id === req.user!.id || isSuperAdmin(target))) return res.status(409).json({ message: "Administrator utama tidak dapat dinonaktifkan." });
      if (isSuperAdmin(target) && (data.email !== SUPER_ADMIN_EMAIL || data.role !== "ADMIN")) return res.status(409).json({ message: "Identitas dan role administrator utama tidak dapat diubah." });
      if (!isSuperAdmin(target) && data.email === SUPER_ADMIN_EMAIL) return res.status(409).json({ message: "Email ini khusus untuk administrator utama." });
      if (!isSuperAdmin(target) && await prisma.phone.count({ where: { userId: id } }) > data.deviceLimit) return res.status(409).json({ message: "Limit baru lebih kecil dari jumlah device pengguna." });
      const passwordData = password ? { password: await bcrypt.hash(password, 12) } : {};
      const result = await prisma.$transaction(async tx => {
        const user = await tx.user.update({ where: { id }, data: { ...data, ...passwordData, ...(data.isActive === false ? { sessionVersion: { increment: 1 } } : {}) }, select });
        if (data.isActive === false) await tx.session.deleteMany({ where: { userId: id } });
        return user;
      });
      if (data.isActive === false) {
        getSocketIO.to(id).emit("account:disabled");
        getSocketIO.in(id).disconnectSockets(true);
      }
      return res.json(result);
    }
    if (!password) return res.status(400).json({ message: "Password wajib untuk pengguna baru." });
    if (data.email === SUPER_ADMIN_EMAIL) return res.status(409).json({ message: "Email ini khusus untuk administrator utama." });
    return res.status(201).json(await prisma.user.create({ data: { ...data, approvalStatus: "APPROVED", password: await bcrypt.hash(password, 12), token: randomUUID() }, select }));
  } catch { return res.status(409).json({ message: "Email sudah dipakai atau pengguna gagal disimpan." }); }
}
export default apiSuperAdminMiddleware(handler);
