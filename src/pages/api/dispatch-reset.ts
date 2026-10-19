import type { NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ownerScope } from "@/lib/access";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import type { AuthNextApiRequest } from "@/types/global";
import { DispatchError } from "@/server/dispatch/queue";
import { updateDispatches } from "@/server/dispatchWebhook/events";

const input = z.object({ id: z.string().uuid() }).strict();

async function handler(req: AuthNextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).end(); }
  const parsed = input.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "ID pengiriman tidak valid." });
  try {
    await prisma.$transaction(async tx => {
      const scope = { id: parsed.data.id, ...ownerScope(req.user!) };
      const job = await tx.waDispatch.findFirst({ where: scope });
      if (!job) throw new DispatchError(404, "Pengiriman tidak ditemukan atau tidak dapat diakses.");
      if (!["FAILED", "UNCERTAIN"].includes(job.status) || job.sentAt || job.deliveredAt || job.readAt) {
        throw new DispatchError(409, "Reset hanya untuk pengiriman Gagal atau Perlu diperiksa yang belum terkonfirmasi terkirim.");
      }
      const phone = await tx.phone.findFirst({ where: { id: job.phoneId, userId: job.userId } });
      if (!phone) throw new DispatchError(409, "Perangkat pengirim sudah tidak tersedia.");
      const now = new Date();
      if (job.campaignId) {
        await tx.$queryRaw`SELECT id FROM campaigns WHERE id = ${job.campaignId} FOR UPDATE`;
        const campaign = await tx.campaign.findUnique({ where: { id: job.campaignId } });
        if (!campaign || !["WAITING", "PROCESSING"].includes(campaign.status)) {
          throw new DispatchError(409, "Campaign sudah berhenti atau selesai. Aktifkan campaign sebelum reset pengiriman.");
        }
      }
      // Recheck the snapshot and receipts atomically; a second reset cannot revive a claimed job.
      const changed = await updateDispatches({ where: { ...scope, status: job.status, updatedAt: job.updatedAt,
        sentAt: null, deliveredAt: null, readAt: null }, data: {
        status: "QUEUED", attempts: 0, messageId: null, lastError: null, leaseToken: null, leaseUntil: null,
        createdAt: now, nextAttemptAt: now, expiresAt: new Date(now.getTime() + 86400000),
      } }, tx);
      if (changed.count !== 1) throw new DispatchError(409, "Status pengiriman telah berubah. Refresh data sebelum mencoba lagi.");
    }, { isolationLevel: "ReadCommitted", timeout: 20000 });
    return res.json({ result: true, message: "Pengiriman berhasil direset dan kembali ke antrean." });
  } catch (error) {
    if (error instanceof DispatchError) return res.status(error.status).json({ message: error.message });
    throw error;
  }
}

export default apiAuthMiddleware(handler);
