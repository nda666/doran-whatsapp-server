import { getDispatchDisplayWindow } from "@/server/dispatch/settings";
import { tableQuery } from "@/lib/tableQuery";
import { ownerScope } from "@/lib/access";
import type { NextApiResponse } from "next";
import { WaDispatchStatus } from "@prisma/client";
import { z } from "zod";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { AuthNextApiRequest } from "@/types/global";
import { prisma } from "@/lib/prisma";
import { csv } from "@/server/campaigns/csv";
import { phoneReport } from "@/server/phoneReport";
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v);
async function handler(req: AuthNextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();
  res.setHeader("Cache-Control", "no-store");
  if (req.query.view === "phones") return phoneReport(req, res);
  const window = await getDispatchDisplayWindow();
  const start = date.safeParse(req.query.start), end = date.safeParse(req.query.end);
  const hasPeriod = req.query.start !== undefined || req.query.end !== undefined;
  if (hasPeriod && (!start.success || !end.success || start.data > end.data)) return res.status(400).json({ message: "Periode laporan tidak valid." });
  const reportStart = start.success ? new Date(`${start.data}T00:00:00+07:00`) : window.start;
  const reportEnd = end.success ? new Date(new Date(`${end.data}T00:00:00+07:00`).getTime() + 86400000) : window.end;
  const status = Object.values(WaDispatchStatus).includes(req.query.status as WaDispatchStatus) ? req.query.status as WaDispatchStatus : undefined;
  const where = { ...ownerScope(req.user!), createdAt: { gt: window.start, gte: reportStart, lte: window.end, lt: reportEnd },
    ...(typeof req.query.phoneId === "string" && req.query.phoneId ? { phoneId: req.query.phoneId } : {}), ...(status ? { status } : {}) };
  const { page, limit, skip, orderBy } = tableQuery(req.query, ["recipient", "phoneId", "source", "status", "lastError", "createdAt"], "createdAt", "desc");
  const exporting = req.query.export === "csv";
  const [data, total, counts] = await Promise.all([prisma.waDispatch.findMany({ where, orderBy, take: exporting ? 10000 : limit, skip: exporting ? 0 : skip,
    select: { id: true, recipient: true, phoneId: true, source: true, campaignId: true, status: true, lastError: true, createdAt: true, sentAt: true } }), prisma.waDispatch.count({ where }), prisma.waDispatch.groupBy({ by: ["status"], where, _count: { _all: true } })]);
  if (exporting) {
    if (total > 10000) return res.status(400).json({ message: "Export maksimal 10.000 baris. Persempit periode/filter." });
    res.setHeader("Content-Type", "text/csv; charset=utf-8"); res.setHeader("Content-Disposition", 'attachment; filename="laporan.csv"');
    return res.send(csv([["id", "penerima", "device", "via", "campaign", "status", "keterangan", "dibuat_utc", "terkirim_utc"], ...data.map(r => [r.id, r.recipient, r.phoneId, r.source, r.campaignId, r.status, r.lastError, r.createdAt.toISOString(), r.sentAt?.toISOString()])]));
  }
  return res.json({ display_window: { days: window.days, start: window.start, end: window.end }, data, total, counts: Object.fromEntries(counts.map(c => [c.status, c._count._all])) });
}
export default apiAuthMiddleware(handler);
