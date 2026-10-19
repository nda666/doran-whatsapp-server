import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { dispatchSummary, requestJobId, requestJobKey } from "@/server/dispatch/queue";
import type { Phone } from "@prisma/client";
import { DispatchAuthError, resolveDispatchDevice } from "@/server/dispatchAuth";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "POST"].includes(req.method || "")) return res.status(405).json({ result: false, curl_error: null, message: "Metode tidak diizinkan." });
  const input = req.method === "POST" ? req.body || {} : req.query;
  let phone: Phone;
  try { phone = (await resolveDispatchDevice(req, input)).phone; }
  catch (error) {
    if (!(error instanceof DispatchAuthError)) throw error;
    const hasCredential = req.headers.authorization || input.api_key || req.query?.api_key || input.token_api || req.query?.token_api;
    const message = error.invalidToken ? hasCredential ? "Token tidak valid." : "Token perangkat diperlukan." : error.message;
    return res.status(error.status).json({ result: false, curl_error: null, message });
  }
  let jobId: string | null;
  try { jobId = requestJobId(input); }
  catch (error) { return res.status(400).json({ result: false, curl_error: null, message: (error as Error).message }); }
  if (!jobId && typeof input.id !== "string" && typeof input.transaction_id !== "string") return res.status(400).json({ result: false, curl_error: null, message: "Isi job_id, id pekerjaan, atau transaction_id." });
  const page = Math.min(10_000, Math.max(1, Math.trunc(Number(input.page) || 1)));
  const where = { phoneId: phone.id, ...(jobId ? { requestJobKey: requestJobKey(phone.id, jobId) } : typeof input.id === "string" ? { id: input.id } : {
    transactionId: input.transaction_id as string, storeId: typeof input.store_id === "string" ? input.store_id : "default",
    ...(typeof input.message_key === "string" ? { messageKey: input.message_key } : {}),
  }) };
  const [total, jobs] = await Promise.all([prisma.waDispatch.count({ where }), prisma.waDispatch.findMany({ where, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 100, skip: (page - 1) * 100 })]);
  return res.status(200).json({ result: true, ...(jobId ? { job_id: jobId } : {}), total, page, data: jobs.map(dispatchSummary) });
}
