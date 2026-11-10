import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { PhoneCleanupOptions } from "../lib/phoneCleanup";
import { cleanupPhone, PhoneCleanupError } from "./cleanupPhone";

type Job = { id: string; phoneId: string; requestedBy: string; options: string; pending: boolean;
  finishedAt?: number; result?: { result: boolean; deleted: boolean }; error?: { status: number; message: string } };
const shared = globalThis as typeof globalThis & { doranPhoneCleanupJobs?: Map<string, Job> };
const jobs = shared.doranPhoneCleanupJobs || (shared.doranPhoneCleanupJobs = new Map<string, Job>());

export function startPhoneCleanup(phoneId: string, requestedBy: string, scope: Prisma.PhoneWhereInput, options: PhoneCleanupOptions) {
  const encoded = JSON.stringify(options);
  for (const [id, job] of Array.from(jobs)) {
    if (job.finishedAt && Date.now() - job.finishedAt > 30 * 60_000) jobs.delete(id);
    if (job.phoneId === phoneId && job.pending) {
      if (job.requestedBy === requestedBy && job.options === encoded) return job;
      throw new PhoneCleanupError("Perangkat sedang dibersihkan. Tunggu hingga selesai.");
    }
  }
  const job: Job = { id: randomUUID(), phoneId, requestedBy, options: encoded, pending: true };
  jobs.set(job.id, job);
  void cleanupPhone(phoneId, scope, options).then(result => { job.result = result; }).catch(error => {
    job.error = error instanceof PhoneCleanupError ? { status: error.status, message: error.message }
      : { status: 500, message: "Pembersihan belum selesai. Ulangi pembersihan untuk melanjutkan." };
    if (!(error instanceof PhoneCleanupError)) console.error("PHONE_CLEANUP_FAILED", { phoneId,
      code: typeof error?.code === "string" ? error.code : /^WA_AUTH_[A-Z_]+$/.test(error?.message || "") ? error.message : "UNKNOWN",
      name: error?.name, stack: typeof error?.stack === "string" ? error.stack.split("\n").filter((line: string) => /^\s+at /.test(line)).slice(0, 6) : undefined });
  }).finally(() => { job.pending = false; job.finishedAt = Date.now(); });
  return job;
}

export function phoneCleanupJob(id: string, phoneId: string, requestedBy: string) {
  const job = jobs.get(id);
  return job?.phoneId === phoneId && job.requestedBy === requestedBy ? job : undefined;
}
