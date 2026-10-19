import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { failureCategory } from "../../lib/messagingLabels";
export async function summarize(where: Prisma.WaDispatchWhereInput) {
  const [total, attempted, sent, delivered, read, failed, suppressed, pending, uncertain, errors, devices] = await Promise.all([
    prisma.waDispatch.count({ where }),
    prisma.waDispatch.count({ where: { AND: [where, { attempts: { gt: 0 } }] } }),
    prisma.waDispatch.count({ where: { AND: [where, { OR: [{ sentAt: { not: null } }, { deliveredAt: { not: null } }, { readAt: { not: null } }] }] } }),
    prisma.waDispatch.count({ where: { AND: [where, { OR: [{ deliveredAt: { not: null } }, { readAt: { not: null } }] }] } }),
    prisma.waDispatch.count({ where: { AND: [where, { readAt: { not: null } }] } }),
    prisma.waDispatch.count({ where: { AND: [where, { status: "FAILED", attempts: { gt: 0 } }] } }),
    prisma.waDispatch.count({ where: { AND: [where, { status: "SUPPRESSED" }] } }),
    prisma.waDispatch.count({ where: { AND: [where, { status: { in: ["QUEUED", "PROCESSING"] } }] } }),
    prisma.waDispatch.count({ where: { AND: [where, { status: "UNCERTAIN" }] } }),
    prisma.waDispatch.groupBy({ by: ["lastError"], where: { AND: [where, { status: "FAILED" }] }, _count: { _all: true } }),
    prisma.waDispatch.groupBy({ by: ["phoneId", "status"], where, _count: { _all: true } }),
  ]);
  const categories: Record<string, number> = {};
  errors.forEach(e => { const label = failureCategory(e.lastError); categories[label] = (categories[label] || 0) + e._count._all; });
  return { total, attempted, sent, delivered, read, failed, suppressed, pending, uncertain,
    deliveryRate: attempted ? delivered / attempted * 100 : null, readRate: delivered ? read / delivered * 100 : null, failureRate: attempted ? failed / attempted * 100 : null,
    failures: Object.entries(categories).map(([reason, count]) => ({ reason, count })).sort((a,b) => b.count - a.count),
    devices: Array.from(new Set(devices.map(d => d.phoneId))).map(phoneId => ({ phoneId, counts: Object.fromEntries(devices.filter(d => d.phoneId === phoneId).map(d => [d.status, d._count._all])) })),
  };
}
