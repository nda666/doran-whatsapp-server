import { tableQuery } from "@/lib/tableQuery";
import { ownerScope } from "@/lib/access";
import type { NextApiResponse } from "next";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { prisma } from "@/lib/prisma";
import { AuthNextApiRequest } from "@/types/global";
import { dispatchSummary, requestJobId, requestJobKey, DispatchError } from "@/server/dispatch/queue";
import { WaDispatchStatus } from "@prisma/client";
import { dispatchWaitingReason } from "@/lib/dispatchPresentation";
import { getDispatchMaxAgeDays } from "@/server/dispatch/settings";
import { dispatchAgeCutoff } from "@/lib/dispatchSettings";
import { dispatchDateFilter } from "@/lib/dispatchDateFilter";

async function handler(req: AuthNextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).end();
  if (typeof req.query.id === "string") {
    const job = await prisma.waDispatch.findFirst({ where: { id: req.query.id, ...ownerScope(req.user!) },
      select: { id: true, recipient: true, status: true, message: true, image: true, payload: true,
        media: { select: { name: true, originalName: true, mime: true } } } });
    if (!job) return res.status(404).json({ message: "Pesan tidak ditemukan atau tidak dapat diakses." });
    return res.json({ ...job, content_available: !!(job.message || job.image || job.payload || job.media) });
  }
  const statuses = Object.values(WaDispatchStatus);
  let dateFilter: ReturnType<typeof dispatchDateFilter>;
  try {
    dateFilter = dispatchDateFilter(req.query.start_date, req.query.end_date);
  } catch (error) {
    return res.status(400).json({ message: (error as Error).message });
  }
  let jobId: string | null = null;
  try {
    jobId = req.query.job_id === undefined || req.query.job_id === "" ? null : requestJobId({ job_id: req.query.job_id });
  } catch (error) {
    if (error instanceof DispatchError) return res.status(error.status).json({ message: error.message });
    throw error;
  }
  const jobPhones = jobId ? await prisma.phone.findMany({ where: { ...ownerScope(req.user!),
    ...(typeof req.query.phone_id === "string" && req.query.phone_id ? { id: req.query.phone_id } : {}) }, select: { id: true } }) : [];
  const state = typeof req.query.status === "string" && statuses.includes(req.query.status as WaDispatchStatus) ? req.query.status as WaDispatchStatus : undefined;
  const { page, limit, skip, orderBy } = tableQuery(req.query, {"job_id": "clientJobId", "store_id": "storeId", "transaction_id": "transactionId", "message_key": "messageKey", "sender": "phoneId", "recipient": "recipient", "source": "source", "status": "status", "attempts": "attempts", "error": "lastError", "created_at": "createdAt", "updated_at": "updatedAt"}, "createdAt", "desc");
  const maxAgeDays = await getDispatchMaxAgeDays();
  const cutoff = dispatchAgeCutoff(maxAgeDays);
  const displayScope = { ...ownerScope(req.user!), createdAt: { gt: cutoff, ...dateFilter } };
  const where = { ...displayScope, ...(state ? { status: state } : {}),
    ...(jobId ? { OR: [{ id: jobId }, { requestJobKey: { in: jobPhones.map(phone => requestJobKey(phone.id, jobId!)) } }] } : {}),
    ...(typeof req.query.phone_id === "string" && req.query.phone_id ? { phoneId: req.query.phone_id } : {}),
    ...(["WEB", "API"].includes(String(req.query.source)) ? { source: String(req.query.source) } : {}),
    ...(typeof req.query.transaction_id === "string" && req.query.transaction_id ? { transactionId: req.query.transaction_id } : {}),
    ...(typeof req.query.store_id === "string" && req.query.store_id ? { storeId: req.query.store_id } : {}),
    ...(req.query.store_filter === "non_default" ? { AND: [{ storeId: { not: "default" } }] } :
      req.query.store_filter === "default" ? { AND: [{ storeId: "default" }] } : {}) };
  const [total, jobs, counts] = await Promise.all([prisma.waDispatch.count({ where }),
    prisma.waDispatch.findMany({ where, take: limit, skip, orderBy, include: { campaign: { select: { status: true, scheduledAt: true } } } }),
    prisma.waDispatch.groupBy({ by: ["status"], where: req.query.summary_filtered === "1" ? where : displayScope, _count: { _all: true } }),
  ]);
  const phones = await prisma.phone.findMany({ where: { ...ownerScope(req.user!), id: { in: Array.from(new Set(jobs.map(job => job.phoneId))) } }, select: { id: true, name: true, number: true, active: true, status: true } });
  return res.status(200).json({ result: true, total, page, max_age_days: maxAgeDays, display_cutoff: cutoff, counts: Object.fromEntries(counts.map(item => [item.status, item._count._all])),
    data: jobs.map(job => ({ ...dispatchSummary(job), updated_at: job.updatedAt, job_id: job.clientJobId, transaction_id: job.transactionId, store_id: job.storeId,
      message_key: job.messageKey, source: job.source, waiting_reason: dispatchWaitingReason(job, phones.find(phone => phone.id === job.phoneId)),
      sender: phones.find(phone => phone.id === job.phoneId)?.number || job.phoneId })) });
}
export default apiAuthMiddleware(handler);
