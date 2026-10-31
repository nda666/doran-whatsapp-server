import { createDispatches } from "@/server/dispatchWebhook/events";
import type { NextApiRequest, NextApiResponse } from "next";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { prepareDispatch, DispatchError, dispatchResponse, existingRequestJob } from "@/server/dispatch/queue";
import { publicPayload, payloadContent } from "@/server/campaigns/content";
import { normalizePhoneRecipient } from "@/utils/normalizePhoneRecipient";
import makeWASocket, { session } from "@/server/libs/makeWASocket";
import { waitForQr } from "@/server/libs/qrState";
import { isPairingInProgress } from "@/server/libs/pairingState";
import { pairingSessionIdentity, registeredPairingNumber } from "@/server/libs/pairingIdentity";
import { registeredPhones } from "@/server/registeredPhones";
import { updateDevice } from "@/server/deviceWebhook/events";
import { resolveControlDevice } from "@/server/dispatchControlAuth";
import type { Phone } from "@prisma/client";
import { DispatchAuthError, resolveDispatchDevice, resolveIntegrationIdentity } from "@/server/dispatchAuth";
import { hasEnabledSenderGroup } from "@/server/dispatch/senderGroups";
import { isTelegramDevice } from "@/lib/messagingChannel";
import { telegramRecipient } from "@/server/telegram/dispatch";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store"); res.setHeader("Referrer-Policy", "no-referrer");
  if (!["GET", "POST"].includes(req.method || "")) return res.status(405).json({ result: false, curl_error: null, message: "Metode tidak diizinkan." });
  const body = req.method === "GET" ? req.query : req.body || {};
  const action = String(req.query.action);
  const sending = /^send-(message|media|poll|sticker|button|list|location|vcard)$/.test(action);
  let phone: Phone;
  try {
    if (action === "list-phones" || action === "phone-detail") {
      const identity = await resolveIntegrationIdentity(req, body);
      return await registeredPhones(action, identity.user.id, body.number, res);
    }
    if (sending) phone = (await resolveDispatchDevice(req, body)).phone;
    else {
      phone = await resolveControlDevice(req, body);
    }
    if (action === "session") return res.json({ channel: phone.channel || "whatsapp", active: phone.active === 1, online: phone.isOnline, name: phone.account_name, number: phone.number,
      ...(!isTelegramDevice(phone) ? pairingSessionIdentity(phone, session.get(phone.id)) : {}),
    });
    if (isTelegramDevice(phone) && !["send-message", "send-media", "session", "disconnect"].includes(action)) return res.status(422).json({ result: false, message: "Endpoint ini belum didukung provider Telegram. Gunakan send-message atau send-media untuk gambar." });
    if (action === "disconnect") {
      // Inactivate first so periodic reconnect cannot undo explicit disconnection.
      await prisma.$transaction(tx => updateDevice(tx, { id: phone.id, userId: phone.userId }, { active: 0, isOnline: false, status: "CLOSE" }, "device.active_changed"));
      session.get(phone.id)?.end(new Error("DEVICE_DISCONNECTED")); session.delete(phone.id);
      return res.json({ result: true });
    }
    if (/^send-(message|media|poll|sticker|button|list|location|vcard)$/.test(action)) {
      const previous = await existingRequestJob(phone.id, body);
      if (previous) return res.status(202).json(previous);
    }
    if (phone.active !== 1 && !(sending && process.env.DISPATCH_QUEUE_ENABLED === "true" && await hasEnabledSenderGroup(phone))) return res.status(409).json({ result: false, curl_error: null, message: "Device nonaktif." });
    if (["generate-qr", "check-number"].includes(action) && process.env.WHATSAPP_ENABLED === "false") return res.status(503).json({ result: false, curl_error: null, message: "Koneksi WhatsApp dinonaktifkan." });
    if (action === "generate-qr") {
      if (body.expected_number !== undefined && (typeof body.expected_number !== "string" || !registeredPairingNumber(phone.number) || body.expected_number !== registeredPairingNumber(phone.number))) {
        return res.status(422).json({ result: false, message: "Nomor WhatsApp tidak sesuai perangkat terdaftar." });
      }
      if (isPairingInProgress(phone.id)) return res.json({ pairing: true });
      return res.json(await waitForQr(await makeWASocket(phone.userId, phone.id)));
    }
    if (action === "check-number") {
      const number = normalizePhoneRecipient(String(body.number || ""));
      const socket = session.get(phone.id); if (!socket?.ws.isOpen) return res.status(409).json({ result: false, curl_error: null, message: "Device offline." });
      const result = await socket.onWhatsApp(number); return res.json({ number, registered: !!result?.[0]?.exists });
    }
    if (!/^send-(message|media|poll|sticker|button|list|location|vcard)$/.test(action)) return res.status(404).json({ result: false, curl_error: null, message: "Endpoint tidak ditemukan." });
    if (process.env.DISPATCH_QUEUE_ENABLED !== "true") return res.status(503).json({ result: false, curl_error: null, message: "Antrean pengiriman belum aktif." });
    let payload: ReturnType<typeof publicPayload.parse> | undefined;
    let mediaId: string | null = null;
    if (action === "send-media" || action === "send-sticker") {
      if (typeof body.media_id !== "string") throw new DispatchError(400, "media_id wajib diisi; upload melalui File Manager.");
      const media = await prisma.mediaAsset.findFirst({ where: { id: body.media_id, userId: phone.userId } });
      if (!media || (action === "send-sticker" && media.mime !== "image/webp")) throw new DispatchError(400, "Media tidak tersedia/format sticker harus WebP.");
      if (isTelegramDevice(phone) && !/^image\/(jpeg|png|gif|webp)$/.test(media.mime)) throw new DispatchError(422, "Provider Telegram saat ini hanya mendukung media gambar.");
      mediaId = media.id;
      if (action === "send-sticker") payload = { kind: "sticker" };
    } else if (action !== "send-message") {
      const raw = typeof body.payload === "string" ? JSON.parse(body.payload) : body.payload;
      payload = publicPayload.parse({ ...raw, kind: action.slice(5) });
      payloadContent(payload);
    }
    const prepared = prepareDispatch(phone.id, phone.userId, { ...body, message: body.message || (payload && "text" in payload ? payload.text : `[${action}]`) });
    prepared.jobs = prepared.jobs.map(job => telegramRecipient(job, phone));
    const jobs = prepared.jobs.map(j => ({ ...j, mediaId, payload, payloadHash: mediaId || payload ? createHash("sha256").update(JSON.stringify([j.message, j.image, mediaId, payload || null])).digest("hex") : j.payloadHash }));
    const data = await prisma.$transaction(async tx => {
      const previous = await existingRequestJob(phone.id, body, tx);
      if (previous) return { response: previous, jobs: [] };
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${phone.userId} FOR UPDATE`;
      const existing = await tx.waDispatch.count({ where: { dedupeKey: { in: jobs.map(j => j.dedupeKey) } } });
      if (existing < jobs.length && await tx.waDispatch.count({ where: { status: { in: ["QUEUED", "PROCESSING"] } } }) + jobs.length - existing > 100000) throw new DispatchError(503, "Antrean penuh.");
      await tx.waSenderLease.createMany({ data: [{ phoneId: phone.id }], skipDuplicates: true });
      await createDispatches(tx, { data: jobs, skipDuplicates: true });
      const stored = await tx.waDispatch.findMany({ where: { dedupeKey: { in: jobs.map(j => j.dedupeKey) } } });
      if (stored.some(j => j.payloadHash !== jobs[0].payloadHash)) throw new DispatchError(409, "ID transaksi sudah digunakan untuk isi berbeda.");
      return { jobs: stored };
    }, { timeout: 20000 });
    return res.status(202).json("response" in data ? data.response : dispatchResponse(prepared, data.jobs));
  } catch (e) {
    if (e instanceof DispatchAuthError) return res.status(e.status).json({ result: false, curl_error: null, message: e.invalidToken ? "Token tidak valid." : e.message });
    if (action === "list-phones" || action === "phone-detail") return res.status(500).json({ result: false, curl_error: null, message: "Detail device gagal diambil. Silakan coba lagi." });
    return res.status(e instanceof DispatchError ? e.status : 400).json({ result: false, curl_error: null, message: e instanceof DispatchError ? e.message : "Parameter tidak valid atau device belum tersedia." });
  }
}
