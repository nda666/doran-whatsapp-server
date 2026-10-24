import { ownerScope } from "@/lib/access";
import type { NextApiResponse } from "next";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { prisma } from "@/lib/prisma";
import sendMessageFromIo from "@/server/libs/sendMessageFromIo";
import { SendMessageValidation } from "@/validations/sendMessage";
import { AuthNextApiRequest } from "@/types/global";
import { enqueueDispatch } from "@/server/dispatch/queue";
import { randomUUID } from "node:crypto";
import { normalizePhoneRecipient } from "@/utils/normalizePhoneRecipient";
import { testSendRequest } from "@/lib/testSend";
import { prepareTestContent, enqueueTestContent } from "@/server/dispatch/testSend";
import { DispatchError } from "@/server/dispatch/queue";
import { isTelegramDevice, telegramMessageTypes } from "@/lib/messagingChannel";
import { telegramEnabled } from "@/server/telegram/availability";

async function handler(req: AuthNextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "POST"].includes(req.method || "")) {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ message: "Method not allowed" });
  }
  const phone = await prisma.phone.findFirst({ where: { id: String(req.query.id), ...ownerScope(req.user!) } });
  if (!phone) return res.status(404).json({ message: "Perangkat tidak ditemukan." });
  if (req.method === "GET") {
    const data = await prisma.mediaAsset.findMany({ where: { userId: phone.userId }, orderBy: { createdAt: "desc" }, take: 1000, select: { id: true, name: true, mime: true } });
    return res.json({ data });
  }
  const telegram = isTelegramDevice(phone);
  if (telegram ? !telegramEnabled() : process.env.WHATSAPP_ENABLED === "false") return res.status(503).json({ message: "Kanal pengiriman sedang dinonaktifkan atau belum dikonfigurasi." });
  if (telegram && process.env.DISPATCH_QUEUE_ENABLED !== "true") return res.status(503).json({ message: "Aktifkan antrean pengiriman untuk Telegram." });
  if (phone.active !== 1 || (!telegram && !phone.isOnline)) return res.status(409).json({ message: "Test kirim hanya tersedia untuk perangkat aktif dan siap mengirim." });
  const parsed = testSendRequest.safeParse(req.body || {});
  if (!parsed.success) return res.status(400).json({ message: "Periksa tipe pesan, satu nomor tujuan, dan pesan maksimal 1.000 karakter." });
  const input = parsed.data;
  if (telegram && !(telegramMessageTypes as readonly string[]).includes(input.type)) return res.status(422).json({ message: "Provider Telegram saat ini mendukung teks dan gambar. Tipe pesan ini belum didukung." });
  const { number, message } = input;
  let recipient: string;
  try { recipient = normalizePhoneRecipient(number); }
  catch { return res.status(400).json({ message: "Nomor tujuan tidak valid. Gunakan 0812…, 62812…, atau +62812…" }); }
  const validation = await SendMessageValidation({ number: recipient, message: message || `[Test ${input.type}]` });
  if (!validation.result) return res.status(400).json({ message: "Nomor tujuan tidak valid. Gunakan 0812…, 62812…, atau +62812…" });
  try {
    if (input.type !== "text") {
      const content = await prepareTestContent(input, phone.userId);
      if (process.env.DISPATCH_QUEUE_ENABLED !== "true") return res.status(503).json({ result: false, message: "Aktifkan antrean pengiriman untuk test tipe pesan ini." });
      const result = await enqueueTestContent(phone.id, phone.userId, recipient, input, content);
      return res.status(200).json({ ...result, message: "Pesan test tersimpan di antrean. Pantau hasilnya di menu Antrean Pengiriman." });
    }
    if (!message.trim()) return res.status(400).json({ message: "Isi pesan test." });
    if (process.env.DISPATCH_QUEUE_ENABLED === "true") {
      const result = await enqueueDispatch(phone.id, phone.userId, { number: recipient, message, transaction_id: randomUUID(), store_id: "dashboard-test" });
      return res.status(200).json({ ...result, message: "Pesan test tersimpan di antrean. Pantau hasilnya di menu Antrean Pengiriman." });
    }
    const messages = await sendMessageFromIo({ phoneId: phone.id, userId: phone.userId, tos: [recipient], phoneCountry: "ID", message });
    return res.status(200).json({ result: true, messageId: messages[0].key.id, message: "Pesan test diterima server WhatsApp. Periksa HP nomor tujuan untuk memastikan diterima." });
  } catch (error) {
    if (error instanceof DispatchError) return res.status(error.status).json({ result: false, message: error.message });
    console.error("WA_TEST_SEND_FAILED", JSON.stringify({ phoneId: phone.id, status: (error as any)?.output?.statusCode }));
    return res.status(502).json({ result: false, message: "Pengiriman belum berhasil dikonfirmasi. Periksa HP tujuan sebelum mencoba lagi." });
  }
}

export default apiAuthMiddleware(handler);
