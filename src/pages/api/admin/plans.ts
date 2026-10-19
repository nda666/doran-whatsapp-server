import type { NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import apiSuperAdminMiddleware from "@/middleware/apiSuperAdminMiddleware";
import type { AuthNextApiRequest } from "@/types/global";
import { tableQuery } from "@/lib/tableQuery";
const input = z.object({ id: z.string().uuid().optional(), name: z.string().trim().min(1).max(100), deviceLimit: z.number().int().min(0).max(10000), description: z.string().trim().max(500).default(""), active: z.boolean().default(true) });
async function handler(req: AuthNextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") {
    if (req.query.options === "1") return res.json(await prisma.subscriptionPlan.findMany({ orderBy: { name: "asc" } }));
    const { limit, skip, orderBy } = tableQuery(req.query, ["name", "deviceLimit", "description", "active"], "name", "asc");
    const q = typeof req.query.q === "string" ? req.query.q.slice(0, 100) : "";
    const where = q ? { name: { contains: q } } : {};
    const [data, total] = await Promise.all([prisma.subscriptionPlan.findMany({ where, take: limit, skip, orderBy }), prisma.subscriptionPlan.count({ where })]);
    return res.json({ data, total });
  }
  if (req.method === "DELETE") {
    const id = z.string().uuid().safeParse(req.body?.id);
    if (!id.success) return res.status(400).end();
    try {
      await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM subscription_plans WHERE id = ${id.data} FOR UPDATE`;
        const plan = await tx.subscriptionPlan.findUniqueOrThrow({ where: { id: id.data } });
        if (plan.name === "Standard" || await tx.user.count({ where: { plan: plan.name } })) throw new Error("Paket default atau paket yang digunakan pengguna tidak dapat dihapus. Nonaktifkan paket jika tidak ingin dipilih lagi.");
        await tx.subscriptionPlan.delete({ where: { id: id.data } });
      });
      return res.json({ message: "Paket dihapus." });
    } catch (error) { return res.status(409).json({ message: error instanceof Error ? error.message : "Paket gagal dihapus." }); }
  }
  if (req.method !== "POST") return res.status(405).end();
  const parsed = input.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Nama, batas device, atau deskripsi paket tidak valid." });
  const { id, ...data } = parsed.data;
  try {
    const result = await prisma.$transaction(async tx => {
      if (!id) return tx.subscriptionPlan.create({ data });
      await tx.$queryRaw`SELECT id FROM subscription_plans WHERE id = ${id} FOR UPDATE`;
      const previous = await tx.subscriptionPlan.findUniqueOrThrow({ where: { id } });
      if (previous.name === "Standard" && (data.name !== "Standard" || !data.active)) throw new Error("Paket Standard adalah default pendaftaran dan harus tetap aktif.");
      const updated = await tx.subscriptionPlan.update({ where: { id }, data });
      if (previous.name !== data.name) await tx.user.updateMany({ where: { plan: previous.name }, data: { plan: data.name } });
      return updated;
    });
    return res.status(id ? 200 : 201).json(result);
  } catch (error: any) { return res.status(409).json({ message: error?.code === "P2002" ? "Nama paket sudah digunakan." : error?.message || "Paket gagal disimpan." }); }
}
export default apiSuperAdminMiddleware(handler);
