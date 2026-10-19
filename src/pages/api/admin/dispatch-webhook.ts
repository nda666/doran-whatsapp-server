import { randomUUID } from "node:crypto";
import type { NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/access";
import apiSuperAdminMiddleware from "@/middleware/apiSuperAdminMiddleware";
import type { AuthNextApiRequest } from "@/types/global";
import { enqueueDispatchEvent } from "@/server/dispatchWebhook/events";

const input = z.object({ enabled: z.boolean(), url: z.string().trim().max(2000),
  secret: z.string().min(16).max(256).regex(/^[\x21-\x7e]+$/).optional() }).strict();
export function validDispatchWebhookUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.hash && (!url.port || url.port === "443");
  } catch { return false; }
}
async function handler(req: AuthNextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (!isSuperAdmin(req.user!)) return res.status(403).json({ message: "Pengaturan webhook global hanya untuk admin utama." });
  if (req.method === "GET") {
    const config = await prisma.dispatchWebhookSetting.findUnique({ where: { id: 1 } });
    const events = await prisma.dispatchWebhookEvent.findMany({ take: 20, orderBy: { id: "desc" },
      select: { id: true, eventId: true, dispatchId: true, event: true, status: true, attempts: true, lastError: true, createdAt: true, deliveredAt: true } });
    return res.json({ settings: { enabled: config?.enabled || false, url: config?.url || "", secretConfigured: !!config?.secret }, events });
  }
  if (req.method !== "POST") { res.setHeader("Allow", "GET, POST"); return res.status(405).end(); }
  if (req.body?.action === "test") {
    const queued = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM dispatch_webhook_settings WHERE id = 1 FOR UPDATE`;
      const config = await tx.dispatchWebhookSetting.findUnique({ where: { id: 1 } });
      if (!config?.enabled) return false;
      await enqueueDispatchEvent(tx);
      return true;
    });
    return res.status(queued ? 202 : 409).json({ message: queued ? "Tes masuk antrean. Periksa status pengiriman di bawah." : "Simpan dan aktifkan webhook terlebih dahulu." });
  }
  const parsed = input.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Pengaturan tidak valid. Kunci minimal 16 karakter tanpa spasi." });
  if (parsed.data.url && !validDispatchWebhookUrl(parsed.data.url) || parsed.data.enabled && !parsed.data.url) {
    return res.status(400).json({ message: "Gunakan endpoint HTTPS publik, tanpa username/password, fragment, atau port selain 443." });
  }
  const saved = await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM dispatch_webhook_settings WHERE id = 1 FOR UPDATE`;
    const existing = await tx.dispatchWebhookSetting.findUnique({ where: { id: 1 } });
    const secret = parsed.data.secret ?? existing?.secret ?? "";
    if (parsed.data.enabled && !secret) return false;
    const changed = !existing || existing.enabled !== parsed.data.enabled || existing.url !== parsed.data.url || existing.secret !== secret;
    await tx.dispatchWebhookSetting.upsert({ where: { id: 1 },
      create: { id: 1, ...parsed.data, secret, revision: randomUUID() },
      update: { ...parsed.data, secret, ...(changed ? { revision: randomUUID() } : {}) },
    });
    if (changed) await tx.dispatchWebhookEvent.updateMany({ where: { status: { in: ["PENDING", "SENDING"] } },
      data: { status: "CANCELLED", payload: null, leaseToken: null, leaseUntil: null, lastError: "CONFIG_CHANGED" } });
    return true;
  });
  return res.status(saved ? 200 : 400).json({ message: saved ? "Pengaturan webhook status pengiriman tersimpan." : "Isi kunci autentikasi sebelum mengaktifkan webhook." });
}
export default apiSuperAdminMiddleware(handler);
