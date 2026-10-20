import type { NextApiResponse } from "next";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import apiSuperAdminMiddleware from "@/middleware/apiSuperAdminMiddleware";
import type { AuthNextApiRequest } from "@/types/global";
import { prisma } from "@/lib/prisma";
import { DispatchError } from "@/server/dispatch/queue";

const input = z.object({ id: z.string().uuid().optional(), userId: z.string().min(1).max(191),
  name: z.string().trim().min(1).max(100), enabled: z.boolean(),
  phoneIds: z.array(z.string().uuid()).min(1).max(100),
}).strict().refine(value => new Set(value.phoneIds).size === value.phoneIds.length);

export default apiSuperAdminMiddleware(async (req: AuthNextApiRequest, res: NextApiResponse) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") {
    const [groups, phones] = await Promise.all([
      prisma.senderGroup.findMany({ orderBy: [{ name: "asc" }, { id: "asc" }], include: {
        phones: { select: { id: true, name: true, number: true, active: true, isOnline: true, senderPriority: true }, orderBy: [{ senderPriority: "asc" }, { id: "asc" }] },
      } }),
      prisma.phone.findMany({ select: { id: true, name: true, number: true, userId: true, senderGroupId: true,
        user: { select: { name: true, email: true } } }, orderBy: [{ name: "asc" }, { id: "asc" }] }),
    ]);
    return res.json({ groups, phones });
  }
  if (!["POST", "PUT", "DELETE"].includes(req.method || "")) { res.setHeader("Allow", "GET, POST, PUT, DELETE"); return res.status(405).end(); }
  const parsed = req.method === "DELETE" ? z.object({ id: z.string().uuid() }).strict().safeParse(req.body) : input.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Isi nama, pemilik, dan 1–100 perangkat unik untuk grup." });
  try {
    await prisma.$transaction(async tx => {
      const id = parsed.data.id;
      if (req.method !== "POST" && !id) throw new DispatchError(400, "ID grup wajib diisi.");
      if (id) {
        await tx.$queryRaw`SELECT id FROM sender_groups WHERE id = ${id} FOR UPDATE`;
        if (!await tx.senderGroup.findUnique({ where: { id } })) throw new DispatchError(404, "Grup tidak ditemukan.");
      }
      if (req.method === "DELETE") { await tx.senderGroup.delete({ where: { id: id! } }); return; }
      const values = input.parse(parsed.data);
      if (req.method === "POST" && id) throw new DispatchError(400, "ID grup baru dibuat oleh sistem.");
      const existing = id ? await tx.senderGroup.findUniqueOrThrow({ where: { id } }) : null;
      if (existing && existing.userId !== values.userId) throw new DispatchError(409, "Pemilik grup tidak dapat diganti.");
      const owner = await tx.user.findFirst({ where: { id: values.userId, isActive: true, approvalStatus: "APPROVED" }, select: { id: true } });
      if (!owner) throw new DispatchError(400, "Pemilik grup harus merupakan akun aktif yang disetujui.");
      await tx.$queryRaw`SELECT id FROM phones WHERE id IN (${Prisma.join([...values.phoneIds].sort())}) ORDER BY id FOR UPDATE`;
      const phones = await tx.phone.findMany({ where: { id: { in: values.phoneIds } } });
      if (phones.length !== values.phoneIds.length || phones.some(phone => phone.userId !== values.userId)) throw new DispatchError(400, "Seluruh perangkat dalam satu grup harus dimiliki akun yang sama.");
      if (phones.some(phone => phone.senderGroupId && phone.senderGroupId !== id)) throw new DispatchError(409, "Perangkat sudah berada dalam grup lain. Keluarkan dari grup tersebut terlebih dahulu.");
      const group = existing
        ? await tx.senderGroup.update({ where: { id }, data: { name: values.name, enabled: values.enabled } })
        : await tx.senderGroup.create({ data: { userId: values.userId, name: values.name, enabled: values.enabled } });
      await tx.phone.updateMany({ where: { senderGroupId: group.id, id: { notIn: values.phoneIds } }, data: { senderGroupId: null, senderPriority: 0 } });
      for (const [priority, phoneId] of Array.from(values.phoneIds.entries())) {
        await tx.phone.update({ where: { id: phoneId }, data: { senderGroupId: group.id, senderPriority: priority } });
        await tx.waSenderLease.createMany({ data: [{ phoneId }], skipDuplicates: true });
      }
      // Old offline/quota cooldowns must not hide eligible fallback work for a day.
      await tx.waSenderLease.updateMany({ where: { phoneId: { in: values.phoneIds }, OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }] }, data: { nextSendAt: new Date() } });
      await tx.waDispatch.updateMany({ where: { phoneId: { in: values.phoneIds }, source: "API", campaignId: null,
        status: "QUEUED", messageId: null, sentAt: null, deliveredAt: null, readAt: null }, data: { nextAttemptAt: new Date() } });
    }, { isolationLevel: "ReadCommitted", timeout: 20000 });
    return res.json({ result: true });
  } catch (error) {
    if (error instanceof DispatchError) return res.status(error.status).json({ message: error.message });
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) return res.status(409).json({ message: "Nama grup sudah digunakan atau data sedang berubah. Muat ulang lalu coba kembali." });
    throw error;
  }
});
