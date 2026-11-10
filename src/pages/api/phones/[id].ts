import { phoneScope as ownerScope } from "@/lib/access";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { AuthNextApiRequest } from "@/types/global";
import type { NextApiResponse } from "next";
import { phoneCleanupSchema, defaultCleanupOptions } from "@/lib/phoneCleanup";
import { cleanupPhone, PhoneCleanupError } from "@/server/cleanupPhone";
import { startPhoneCleanup, phoneCleanupJob } from "@/server/phoneCleanupJobs";
import { z } from "zod";
async function handler(req: AuthNextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET" && req.query.jobId) {
    const id = z.string().uuid().safeParse(req.query.id), jobId = z.string().uuid().safeParse(req.query.jobId);
    if (!id.success || !jobId.success) return res.status(400).json({ message: "ID pembersihan tidak valid." });
    const job = phoneCleanupJob(jobId.data, id.data, req.user!.id);
    if (!job) return res.status(409).json({ message: "Status pembersihan tidak tersedia. Jika server dimulai ulang, ulangi pembersihan untuk melanjutkan." });
    if (job.pending) return res.status(202).json({ pending: true, jobId: job.id });
    if (job.error) return res.status(job.error.status).json({ message: job.error.message });
    return res.json(job.result);
  }
  if (req.method === "POST" || req.method === "DELETE") {
    const id = z.string().uuid().safeParse(req.query.id);
    const parsed = phoneCleanupSchema.safeParse(req.method === "DELETE" ? { ...defaultCleanupOptions, deleteRecord: true } : req.body);
    if (!id.success || !parsed.success) return res.status(400).json({ message: !parsed.success ? parsed.error.issues.map(i => i.message).join(" ") : "ID perangkat tidak valid." });
    try {
      if (req.query.background === "1") {
        const job = startPhoneCleanup(id.data, req.user!.id, ownerScope(req.user!), parsed.data);
        return res.status(202).json({ pending: true, jobId: job.id });
      }
      return res.json(await cleanupPhone(id.data, ownerScope(req.user!), parsed.data));
    }
    catch (error) {
      if (error instanceof PhoneCleanupError) return res.status(error.status).json({ message: error.message });
      console.error("PHONE_CLEANUP_FAILED");
      return res.status(500).json({ message: "Pembersihan belum selesai. Periksa status perangkat lalu coba kembali." });
    }
  }
  return res.status(405).end();
}
export default apiAuthMiddleware(handler);
