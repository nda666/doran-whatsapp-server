import type { NextApiResponse } from "next";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/access";
import apiSuperAdminMiddleware from "@/middleware/apiSuperAdminMiddleware";
import type { AuthNextApiRequest } from "@/types/global";

const query = z.object({
  type: z.enum(["all", "dispatch", "device"]).default("all"),
  status: z.enum(["", "PENDING", "SENDING", "DELIVERED", "FAILED", "CANCELLED"]).default(""),
  q: z.string().trim().max(200).default(""),
  from: z.string().datetime().optional(), to: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(["", "createdAt", "type", "event", "eventId", "referenceId", "status", "attempts", "lastError"]).default(""),
  order: z.enum(["", "asc", "desc"]).default(""),
  id: z.coerce.number().int().positive().optional(),
});
const fields = { id: true, eventId: true, event: true, status: true, attempts: true,
  lastError: true, createdAt: true, deliveredAt: true, nextAttemptAt: true, revision: true, payload: true } as const;

async function handler(req: AuthNextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (!isSuperAdmin(req.user!)) return res.status(403).json({ message: "Log webhook hanya untuk admin utama." });
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).end(); }
  const parsed = query.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ message: "Filter log tidak valid." });
  const { type, status, q, from, to, page, limit, id, sort, order } = parsed.data;
  if (from && to && from > to) return res.status(400).json({ message: "Rentang tanggal tidak valid." });
  if (id) {
    if (type === "all") return res.status(400).json({ message: "Pilih jenis webhook untuk melihat detail." });
    const event = type === "dispatch"
      ? await prisma.dispatchWebhookEvent.findUnique({ where: { id }, select: { ...fields, dispatchId: true } })
      : await prisma.deviceWebhookEvent.findUnique({ where: { id }, select: { ...fields, deviceId: true } });
    if (!event) return res.status(404).json({ message: "Log tidak ditemukan atau sudah melewati masa penyimpanan." });
    return res.json({ event: { ...event, type } });
  }
  const conditions = [Prisma.sql`1 = 1`];
  if (status) conditions.push(Prisma.sql`status = ${status}`);
  if (from) conditions.push(Prisma.sql`createdAt >= ${new Date(from)}`);
  if (to) conditions.push(Prisma.sql`createdAt <= ${new Date(to)}`);
  if (q) {
    // Escape LIKE wildcards so IDs and text are searched literally.
    const pattern = `%${q.replace(/[!%_]/g, char => `!${char}`)}%`;
    conditions.push(Prisma.sql`(eventId LIKE ${pattern} ESCAPE '!' OR referenceId LIKE ${pattern} ESCAPE '!' OR event LIKE ${pattern} ESCAPE '!' OR lastError LIKE ${pattern} ESCAPE '!')`);
  }
  const sources = [];
  if (type !== "device") sources.push(Prisma.sql`SELECT 'dispatch' AS type, id, eventId, dispatchId AS referenceId, event, status, attempts, lastError, createdAt, deliveredAt, nextAttemptAt FROM dispatch_webhook_events`);
  if (type !== "dispatch") sources.push(Prisma.sql`SELECT 'device' AS type, id, eventId, deviceId AS referenceId, event, status, attempts, lastError, createdAt, deliveredAt, nextAttemptAt FROM device_webhook_events`);
  const logs = Prisma.sql`(${Prisma.join(sources, " UNION ALL ")}) AS logs WHERE ${Prisma.join(conditions, " AND ")}`;
  // Both identifiers and direction are validated against fixed enums above.
  const ordering = sort && order ? Prisma.sql`${Prisma.raw(sort)} ${Prisma.raw(order.toUpperCase())}, createdAt DESC, type ASC, id DESC` : Prisma.sql`createdAt DESC, type ASC, id DESC`;
  const [counts, data] = await prisma.$transaction([
    prisma.$queryRaw<Array<{ total: bigint }>>(Prisma.sql`SELECT COUNT(*) AS total FROM ${logs}`),
    prisma.$queryRaw(Prisma.sql`SELECT * FROM ${logs} ORDER BY ${ordering} LIMIT ${limit} OFFSET ${(page - 1) * limit}`),
  ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  return res.json({ data, total: Number(counts[0].total), page, limit });
}
export default apiSuperAdminMiddleware(handler);
