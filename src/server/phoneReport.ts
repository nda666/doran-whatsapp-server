import type { Prisma } from "@prisma/client";
import type { NextApiResponse } from "next";
import type { AuthNextApiRequest } from "@/types/global";
import { phoneRecordScope as ownerScope, phoneScope } from "@/lib/access";
import { defaultDispatchDates, dispatchDateFilter } from "@/lib/dispatchDateFilter";
import { emptyReportCounts, PhoneReportRow, reportMetric, reportMetrics, successfulStatuses } from "@/lib/phoneReport";
import { prisma } from "@/lib/prisma";
import { csv } from "@/server/campaigns/csv";
import { tableQuery } from "@/lib/tableQuery";

export async function phoneReport(req: AuthNextApiRequest, res: NextApiResponse) {
  const defaults = defaultDispatchDates();
  const hasPeriod = req.query.start !== undefined || req.query.end !== undefined;
  const start = hasPeriod ? req.query.start : defaults.start_date;
  const end = hasPeriod ? req.query.end : defaults.end_date;
  let period: ReturnType<typeof dispatchDateFilter>;
  try { period = dispatchDateFilter(start, end); }
  catch (error) { return res.status(400).json({ message: (error as Error).message }); }
  if (req.query.phoneId !== undefined && typeof req.query.phoneId !== "string") return res.status(400).json({ message: "Perangkat tidak valid." });
  const scope = ownerScope(req.user!);
  const device = req.query.phoneId ? { phoneId: req.query.phoneId as string } : {};
  const where: Prisma.WaDispatchWhereInput = { ...scope, ...device, OR: [
    { status: { in: successfulStatuses }, sentAt: period },
    { status: { notIn: successfulStatuses }, createdAt: period },
  ] };
  // Aggregate in the database: exports and totals never depend on message pagination.
  const [groups, phones] = await Promise.all([
    prisma.waDispatch.groupBy({ by: ["phoneId", "status"], where, _count: { _all: true } }),
    prisma.phone.findMany({ where: { ...phoneScope(req.user!), ...(req.query.phoneId ? { id: req.query.phoneId as string } : {}) }, select: { id: true, number: true, name: true } }),
  ]);
  const rows = new Map<string, PhoneReportRow>(phones.map(phone => [phone.id, { phoneId: phone.id, number: phone.number || "", name: phone.name, ...emptyReportCounts() }]));
  for (const group of groups) {
    // Preserve historical dispatches even if the device has since been deleted.
    const row = rows.get(group.phoneId) || { phoneId: group.phoneId, number: "", name: "Perangkat dihapus", ...emptyReportCounts() };
    row[reportMetric(group.status)] += group._count._all;
    row.total += group._count._all;
    rows.set(group.phoneId, row);
  }
  const data = Array.from(rows.values());
  const counts = emptyReportCounts();
  for (const row of data) for (const metric of reportMetrics) counts[metric] += row[metric];
  const fields = ["number", "name", ...reportMetrics];
  const sort = typeof req.query.sort === "string" && fields.includes(req.query.sort) ? req.query.sort as keyof PhoneReportRow : "sent";
  const direction = req.query.order === "asc" ? 1 : -1;
  data.sort((a, b) => {
    const first = a[sort], second = b[sort];
    const compared = typeof first === "number" && typeof second === "number" ? first - second : String(first).localeCompare(String(second), "id", { numeric: true });
    return compared * direction || a.phoneId.localeCompare(b.phoneId);
  });
  if (req.query.export === "csv") {
    if (data.length > 10000) return res.status(400).json({ message: "Ekspor maksimal 10.000 perangkat. Pilih perangkat tertentu." });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="rekap-per-nomor.csv"');
    return res.send(csv([["mulai_wib", "selesai_wib", "device_id", "nomor_wa", "perangkat", "total", "terkirim", "gagal", "menunggu", "belum_pasti", "diblokir"],
      ...data.map(row => [start, end, row.phoneId, row.number, row.name, ...reportMetrics.map(metric => row[metric])])]));
  }
  const { page, limit, skip } = tableQuery(req.query, fields, "sent");
  return res.json({ data: data.slice(skip, skip + limit), total: data.length, counts, page, period: { start, end } });
}
