import { randomUUID } from "node:crypto";
import type { NextApiResponse } from "next";
import { z } from "zod";
import { WaDispatchStatus, type WaDispatch } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/access";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import type { AuthNextApiRequest } from "@/types/global";
import { dispatchSnapshot } from "@/server/dispatchWebhook/events";
import { sendDeviceWebhook, type WebhookHttpResponse } from "@/server/utils/sendDeviceWebhook";

const endpoint = "https://kasir.doran.id/api/webhooks/jeblast/dispatch-status";
const input = z.object({ id: z.string().uuid(), status: z.nativeEnum(WaDispatchStatus), action: z.literal("preview").optional() }).strict();

function webhookPayload(job: WaDispatch, status: WaDispatchStatus, eventId: string, sequence: number | null, now: Date) {
  const sent = ["SENT", "DELIVERED", "READ"].includes(status);
  const delivered = ["DELIVERED", "READ"].includes(status);
  return { event_id: eventId, sequence, event: "dispatch.status_changed",
    occurred_at: now.toISOString(), previous_status: job.status,
    dispatch: { ...dispatchSnapshot(job), status, updated_at: now,
      attempts: sent ? Math.max(1, job.attempts) : job.attempts,
      error: status === "FAILED" ? "MANUAL_STATUS_FAILED" : status === "UNCERTAIN" ? "MANUAL_STATUS_UNCERTAIN" : null,
      sent_at: sent ? job.sentAt || now : null,
      delivered_at: delivered ? job.deliveredAt || now : null,
      read_at: status === "READ" ? job.readAt || now : null } };
}

function webhookDetails(payload: ReturnType<typeof webhookPayload>, preview: boolean, secret: string) {
  return { mode: preview ? "preview" : "sent", note: preview ? "Pratinjau belum dikirim. Event ID, sequence, dan waktu final dibuat saat Kirim webhook." : "Data request yang dikirim ke endpoint kasir.",
    request: { method: "POST", url: endpoint, headers: { "Content-Type": "application/json", Accept: "application/json",
      Authorization: secret ? `Bearer ${secret}` : "[kunci belum tersedia]", "X-Jeblast-Event-Id": payload.event_id }, body: payload },
    response: null as WebhookHttpResponse | null, started_at: payload.occurred_at, finished_at: null as string | null,
    outcome: preview ? "BELUM_DIKIRIM" : "MENGIRIM" };
}

async function handler(req: AuthNextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (!isSuperAdmin(req.user!)) return res.status(403).json({ message: "Kirim webhook manual hanya untuk admin utama." });
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).end(); }
  const parsed = input.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "ID pengiriman atau status tidak valid." });
  const job = await prisma.waDispatch.findUnique({ where: { id: parsed.data.id } });
  if (!job) return res.status(404).json({ message: "Pengiriman tidak ditemukan." });
  const config = await prisma.dispatchWebhookSetting.findUnique({ where: { id: 1 } });
  const deviceConfig = await prisma.deviceWebhookSetting.findUnique({ where: { id: 1 } });
  // Only reuse an existing authentication key belonging to the same cashier integration.
  const secret = (config?.url === endpoint ? config.secret : "") ||
    (deviceConfig?.url === "https://kasir.doran.id/api/webhooks/jeblast/wa-phone" ? deviceConfig.secret : "");
  if (parsed.data.action === "preview") {
    return res.json({ details: webhookDetails(webhookPayload(job, parsed.data.status, "[dibuat saat dikirim]", null, new Date()), true, secret) });
  }
  if (!secret) return res.status(409).json({ message: "Kunci webhook kasir belum tersedia. Atur kunci di Admin Panel." });
  const status = parsed.data.status, now = new Date();
  // Reserve the same monotonic sequence used by automatic webhook events.
  const eventId = randomUUID();
  const event = await prisma.dispatchWebhookEvent.create({ data: {
    eventId, dispatchId: job.id, event: "dispatch.status_changed", revision: config?.revision || "manual",
    status: "MANUAL_SENDING", attempts: 1, payload: null,
    leaseUntil: new Date(now.getTime() + 60000), nextAttemptAt: now,
  } });
  const payload = webhookPayload(job, status, eventId, event.id, now);
  const details = webhookDetails(payload, false, secret);
  try {
    await sendDeviceWebhook(endpoint, payload, { Authorization: `Bearer ${secret}`, "X-Jeblast-Event-Id": eventId }, response => {
      details.response = { status: response.status, body: response.body.split(secret).join("[disembunyikan]") };
    });
  } catch {
    details.finished_at = new Date().toISOString(); details.outcome = "BELUM_TERKONFIRMASI";
    await prisma.dispatchWebhookEvent.updateMany({ where: { id: event.id, status: "MANUAL_SENDING" },
      data: { status: "FAILED", lastError: "MANUAL_DELIVERY_UNCONFIRMED", leaseUntil: null } });
    return res.status(502).json({ message: "Webhook belum terkonfirmasi berhasil. Periksa riwayat kasir sebelum mengirim lagi.", event_id: eventId, details });
  }
  details.finished_at = new Date().toISOString(); details.outcome = "DITERIMA_ENDPOINT";
  await prisma.dispatchWebhookEvent.updateMany({ where: { id: event.id, status: "MANUAL_SENDING" },
    data: { status: "DELIVERED", deliveredAt: new Date(), leaseUntil: null, lastError: null } });
  return res.json({ message: "Webhook berhasil diterima endpoint kasir.", event_id: eventId, status, details });
}
export default apiAuthMiddleware(handler);
