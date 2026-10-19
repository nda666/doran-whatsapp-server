import { tableQuery } from "@/lib/tableQuery";
import { isSuperAdmin, ownerScope } from "@/lib/access";
import type { NextApiResponse } from "next";
import { z } from "zod";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { AuthNextApiRequest } from "@/types/global";
import { prisma } from "@/lib/prisma";
import { normalizePhoneRecipient } from "@/utils/normalizePhoneRecipient";
import { csv } from "@/server/campaigns/csv";
const input = z.object({ id: z.string().uuid().optional(), name: z.string().trim().max(200).default(""), number: z.string().max(100), groupId: z.string().uuid().nullable().optional() });
async function handler(req: AuthNextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  let userId = req.user!.id;
  const groupId = typeof req.query.groupId === "string" && req.query.groupId ? req.query.groupId : undefined;
  const q = typeof req.query.q === "string" ? req.query.q.slice(0, 200) : undefined;
  const where = { ...ownerScope(req.user!), ...(groupId ? { groupId } : {}), ...(q ? { OR: [{ name: { contains: q } }, { number: { contains: q } }] } : {}) };
  if (req.method === "GET") {
    if (req.query.export === "csv") {
      const rows = await prisma.contact.findMany({ where, include: { group: true }, take: 10000, orderBy: { name: "asc" } });
      res.setHeader("Content-Type", "text/csv; charset=utf-8"); res.setHeader("Content-Disposition", 'attachment; filename="kontak.csv"');
      return res.send(csv([["nama", "nomor", "grup"], ...rows.map(r => [r.name, r.number, r.group?.name])]));
    }
    const { page, limit, skip, orderBy } = tableQuery(req.query, {"name": "name", "number": "number", "group.name": "group.name", "createdAt": "createdAt"}, "name", "asc");
    const [data, total] = await Promise.all([prisma.contact.findMany({ where, include: { group: true }, orderBy, take: limit, skip }), prisma.contact.count({ where })]);
    return res.json({ data, total });
  }
  if (req.method === "DELETE") {
    if (req.body.all !== true && typeof req.body.id !== "string") return res.status(400).end();
    return res.json(await prisma.contact.deleteMany({ where: { ...ownerScope(req.user!), ...(req.body.all === true ? {} : { id: req.body.id }) } }));
  }
  if (req.method !== "POST") return res.status(405).end();
  const parsed = z.array(input).min(1).max(10000).safeParse(req.body.contacts || [req.body]);
  if (!parsed.success) return res.status(400).json({ message: "Kontak tidak valid; maksimal 10.000 baris." });
  try {
    if (parsed.data.length === 1 && parsed.data[0].id) {
      const existing = await prisma.contact.findFirst({ where: { id: parsed.data[0].id, ...ownerScope(req.user!) } });
      if (!existing) return res.status(404).json({ message: "Kontak tidak ditemukan." });
      userId = existing.userId;
    }
    const groupIds = Array.from(new Set(parsed.data.map(c => c.groupId).filter((v): v is string => !!v)));
    const groups = await prisma.contactGroup.findMany({ where: { ...ownerScope(req.user!), id: { in: groupIds } } });
    if (groups.length !== groupIds.length) return res.status(400).json({ message: "Grup tidak ditemukan." });
    if (isSuperAdmin(req.user!) && !parsed.data.some(c => c.id) && groups.length) userId = groups[0].userId;
    if (groups.some(group => group.userId !== userId)) return res.status(400).json({ message: "Grup harus milik pengguna yang sama dengan kontak." });
    const contacts = parsed.data.map(c => ({ ...c, number: normalizePhoneRecipient(c.number), userId }));
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      if (!isSuperAdmin(req.user!) && await tx.contact.count({ where: { userId } }) + contacts.filter(c => !c.id).length > 100000) throw new Error("Maksimal 100.000 kontak.");
      if (contacts.length === 1 && contacts[0].id) {
        const { id, ...data } = contacts[0];
        return tx.contact.updateMany({ where: { id, userId }, data });
      }
      return tx.contact.createMany({ data: contacts.map(({ id: _id, ...c }) => c), skipDuplicates: true });
    }, { timeout: 30000 });
    return res.json(result);
  } catch (error) { return res.status(400).json({ message: error instanceof Error ? error.message : "Kontak gagal disimpan." }); }
}
export default apiAuthMiddleware(handler);
export const config = { api: { bodyParser: { sizeLimit: "3mb" } } };
