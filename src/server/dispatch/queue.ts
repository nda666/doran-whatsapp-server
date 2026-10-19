import { createDispatches } from "../dispatchWebhook/events";
import { createHash, randomUUID } from "node:crypto";
import { normalizePhoneRecipient } from "../../utils/normalizePhoneRecipient";
import { prisma } from "../../lib/prisma";
import type { Prisma } from "@prisma/client";

export class DispatchError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function requestJobId(body: any): string | null {
  if (body.job_id === undefined) return null;
  if (typeof body.job_id !== "string" || !body.job_id.trim() || body.job_id.length > 128 || /[\x00-\x1f]/.test(body.job_id)) {
    throw new DispatchError(400, "job_id harus berupa string 1–128 karakter tanpa karakter kontrol.");
  }
  return body.job_id.trim();
}
export const requestJobKey = (phoneId: string, jobId: string) => hash([phoneId, jobId]);

// A phone row lock serializes first submission of a client job across all send endpoints.
export async function existingRequestJob(phoneId: string, body: any, tx?: Prisma.TransactionClient) {
  const jobId = requestJobId(body);
  if (!jobId) return null;
  if (tx) await tx.$queryRaw`SELECT id FROM phones WHERE id = ${phoneId} FOR UPDATE`;
  const jobs = await (tx || prisma).waDispatch.findMany({ where: { phoneId, requestJobKey: requestJobKey(phoneId, jobId) }, orderBy: { recipient: "asc" } });
  if (!jobs.length) return null;
  return { result: true, queued: true, existing: true, job_id: jobId,
    transaction_id: jobs[0].transactionId, store_id: jobs[0].storeId, message_key: jobs[0].messageKey,
    deduplication_enabled: true, status_url: "/api/send-status", data: jobs.map(dispatchSummary),
    message: "Job sudah tersimpan. Berikut status terakhir; tidak ada pengiriman baru." };
}
export function prepareDispatch(phoneId: string, userId: string, body: any) {
  const jobId = requestJobId(body);
  const identifier = (value: unknown, max: number, fallback: string) => {
    if (value === undefined || value === null || value === "") return fallback;
    if (typeof value !== "string" || !value.trim() || value.length > max || /[\x00-\x1f]/.test(value)) throw new DispatchError(400, "ID transaksi/store/message_key tidak valid.");
    return value.trim();
  };
  const transactionId = identifier(body.transaction_id, 128, randomUUID());
  const storeId = identifier(body.store_id, 64, "default");
  const messageKey = identifier(body.message_key, 64, "default");
  if (typeof body.number !== "string" || !body.number || body.number.length > 3_200 || typeof body.message !== "string" || !body.message.trim() || body.message.length > 10_000) throw new DispatchError(400, "Nomor dan pesan wajib diisi; pesan maksimal 10.000 karakter.");
  if (body.image != null && (typeof body.image !== "string" || body.image.length > 700_000)) throw new DispatchError(400, "Image harus berupa URL atau base64 maksimal 700 KB.");
  const parts = body.number.split(",");
  if (parts.length > 100) throw new DispatchError(400, "Maksimal 100 penerima per request.");
  const recipients = Array.from(new Set(parts.map((number: string) => {
    try {
      return normalizePhoneRecipient(number, body.phoneCountry || body.phoneCode || "ID");
    } catch { throw new DispatchError(400, "Nomor tujuan tidak valid."); }
  }))).sort() as string[];
  const image = body.image || null;
  const payloadHash = hash([body.message, image]);
  // Retained for storage compatibility; the worker applies the current global
  // age limit from createdAt to API jobs, rather than this fixed snapshot.
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const jobs = recipients.map(recipient => ({ id: randomUUID(), phoneId, userId, storeId, transactionId, messageKey,
    recipient, clientJobId: jobId, requestJobKey: jobId ? requestJobKey(phoneId, jobId) : null,
    dedupeKey: jobId ? hash(["job_id", phoneId, jobId, recipient]) : hash([phoneId, storeId, transactionId, messageKey, recipient]), payloadHash,
    message: body.message as string, image: image as string | null, expiresAt }));
  return { transactionId, storeId, messageKey, jobId, suppliedId: !!jobId || !!body.transaction_id, jobs };
}

export const dispatchSummary = (job: any) => ({ id: job.id, recipient: job.recipient, status: job.status,
  message_id: job.messageId, attempts: job.attempts, error: job.lastError, created_at: job.createdAt,
  next_attempt_at: job.status === "QUEUED" ? job.nextAttemptAt : null,
  sent_at: job.sentAt, delivered_at: job.deliveredAt, read_at: job.readAt });

export function dispatchResponse(prepared: ReturnType<typeof prepareDispatch>, jobs: any[]) {
  return { result: true, queued: true, ...(prepared.jobId ? { job_id: prepared.jobId, existing: false } : {}), transaction_id: prepared.transactionId, store_id: prepared.storeId,
    message_key: prepared.messageKey, deduplication_enabled: prepared.suppliedId,
    status_url: "/api/send-status", data: jobs.map(dispatchSummary),
    message: "Request tersimpan dalam antrean. Periksa status setiap penerima untuk hasil pengiriman." };
}

export async function enqueueDispatch(phoneId: string, userId: string, body: any) {
  const previous = await existingRequestJob(phoneId, body);
  if (previous) return previous;
  const prepared = prepareDispatch(phoneId, userId, body);
  const keys = prepared.jobs.map(job => job.dedupeKey);
  const result = await prisma.$transaction(async tx => {
    const previous = await existingRequestJob(phoneId, body, tx);
    if (previous) return { response: previous, jobs: [], existing: 0 };
    const existing = await tx.waDispatch.findMany({ where: { dedupeKey: { in: keys } } });
    if (existing.some(job => job.payloadHash !== prepared.jobs[0].payloadHash)) throw new DispatchError(409, "ID transaksi dan penerima sudah ada dengan isi berbeda. Gunakan message_key berbeda untuk pesan lain pada transaksi yang sama.");
    if (existing.length !== keys.length && await tx.waDispatch.count({ where: { status: { in: ["QUEUED", "PROCESSING"] } } }) >= 100_000) throw new DispatchError(503, "Antrean penuh; ulangi nanti dengan ID transaksi yang sama.");
    // INSERT IGNORE is atomic; ORM upsert with an empty update can race on first use.
    await tx.waSenderLease.createMany({ data: [{ phoneId }], skipDuplicates: true });
    await createDispatches(tx, { data: prepared.jobs, skipDuplicates: true });
    const jobs = await tx.waDispatch.findMany({ where: { dedupeKey: { in: keys } }, orderBy: { recipient: "asc" } });
    // Recheck after unique-key serialization: concurrent conflicting requests must roll back.
    if (jobs.some(job => job.payloadHash !== prepared.jobs[0].payloadHash)) throw new DispatchError(409, "ID transaksi sudah digunakan untuk isi pesan berbeda.");
    return { jobs, existing: existing.length };
  }, { isolationLevel: "ReadCommitted", maxWait: 10_000, timeout: 20_000 });
  return "response" in result ? result.response : dispatchResponse(prepared, result.jobs);
}
