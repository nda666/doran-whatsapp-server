import type { NextApiResponse } from "next";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { AuthNextApiRequest } from "@/types/global";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin, phoneRecordScope, phoneScope, campaignScope } from "@/lib/access";
import { Prisma } from "@prisma/client";
import { dashboardWindowDates } from "@/lib/dashboardStats";
import { getDispatchDisplayWindow } from "@/server/dispatch/settings";
async function handler(req: AuthNextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();
  res.setHeader("Cache-Control", "no-store");
  const userId = req.user!.id;
  const window = await getDispatchDisplayWindow();
  const { days, start, end } = window;
  const dates = dashboardWindowDates(start, end);
  const scope = phoneRecordScope(req.user!);
  const phoneIds = req.user!.accessiblePhoneIds || [];
  const sqlScope = isSuperAdmin(req.user!) ? Prisma.empty : phoneIds.length ? Prisma.sql`AND phoneId IN (${Prisma.join(phoneIds)})` : Prisma.sql`AND 1 = 0`;
  const dispatchScope = { ...scope, createdAt: window.createdAt };
  const [devices, online, counts, activeCampaigns, series, periodCounts, deviceStates, hourly, topDevices] = await Promise.all([
    prisma.phone.count({ where: phoneScope(req.user!) }), prisma.phone.count({ where: { ...phoneScope(req.user!), isOnline: true } }),
    prisma.waDispatch.groupBy({ by: ["status"], where: dispatchScope, _count: { _all: true } }),
    prisma.campaign.count({ where: { ...campaignScope(req.user!), status: { in: ["WAITING", "PROCESSING", "PAUSED"] }, dispatches: { some: { createdAt: window.createdAt } } } }),
    prisma.$queryRaw<Array<{ day: string; count: bigint }>>`SELECT DATE_FORMAT(DATE_ADD(sentAt, INTERVAL 7 HOUR), '%Y-%m-%d') AS day, COUNT(*) AS count FROM wa_dispatches WHERE createdAt > ${start} AND sentAt >= ${start} AND sentAt < ${end} ${sqlScope} GROUP BY day ORDER BY day`,
    prisma.waDispatch.groupBy({ by: ["status"], where: dispatchScope, _count: { _all: true } }),
    prisma.phone.groupBy({ by: ["active", "isOnline"], where: phoneScope(req.user!), _count: { _all: true } }),
    prisma.$queryRaw<Array<{ hour: number; count: bigint }>>`SELECT HOUR(DATE_ADD(sentAt, INTERVAL 7 HOUR)) AS hour, COUNT(*) AS count FROM wa_dispatches WHERE createdAt > ${start} AND sentAt >= ${start} AND sentAt < ${end} ${sqlScope} GROUP BY hour ORDER BY hour`,
    prisma.waDispatch.groupBy({ by: ["phoneId"], where: { ...dispatchScope, sentAt: { gte: start, lt: end } }, _count: { _all: true }, orderBy: { _count: { phoneId: "desc" } }, take: 5 }),
  ]);
  const phones = topDevices.length ? await prisma.phone.findMany({ where: { ...phoneScope(req.user!), id: { in: topDevices.map(r => r.phoneId) } }, select: { id: true, name: true, number: true } }) : [];
  return res.json({ devices, online, unrestricted: isSuperAdmin(req.user!), deviceLimit: req.user!.deviceLimit, plan: req.user!.plan, subscriptionExpiresAt: req.user!.subscriptionExpiresAt,
    counts: Object.fromEntries(counts.map(c => [c.status, c._count._all])), activeCampaigns,
    display_window: { days, start, end },
    period: { days, start, end, timezone: "Asia/Jakarta" },
    series: dates.map(day => ({ day, count: Number(series.find(r => r.day === day)?.count || 0) })),
    periodCounts: Object.fromEntries(periodCounts.map(c => [c.status, c._count._all])),
    deviceHealth: {
      online: deviceStates.filter(r => r.active === 1 && r.isOnline).reduce((n, r) => n + r._count._all, 0),
      offline: deviceStates.filter(r => r.active === 1 && !r.isOnline).reduce((n, r) => n + r._count._all, 0),
      inactive: deviceStates.filter(r => r.active !== 1).reduce((n, r) => n + r._count._all, 0),
    },
    hourly: Array.from({ length: 24 }, (_, hour) => ({ hour, count: Number(hourly.find(r => Number(r.hour) === hour)?.count || 0) })),
    topDevices: topDevices.map(r => { const phone = phones.find(p => p.id === r.phoneId); return { phoneId: r.phoneId, name: phone?.name || "Perangkat dihapus", number: phone?.number || "", count: r._count._all }; }),
  });
}
export default apiAuthMiddleware(handler);
