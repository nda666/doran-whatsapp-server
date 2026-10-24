import { randomUUID } from "node:crypto";
import { prisma } from "../../lib/prisma";
import { enqueueDispatch } from "../dispatch/queue";

/** Trusted server helper. API callers use their device token and the common API. */
export async function enqueueTelegram(phone: string, message: string, mediaUrl?: string, caption?: string, deviceId = process.env.TELEGRAM_DEVICE_ID) {
  if (!deviceId) throw new Error("Pilih TELEGRAM_DEVICE_ID untuk helper server.");
  if (caption !== undefined && caption !== message) throw new Error("Gunakan pesan sebagai caption gambar pada antrean bersama.");
  if (process.env.DISPATCH_QUEUE_ENABLED !== "true") throw new Error("Aktifkan DISPATCH_QUEUE_ENABLED.");
  const device = await prisma.phone.findFirst({ where: { id: deviceId, channel: "telegram", active: 1 } });
  if (!device) throw new Error("Perangkat Telegram aktif tidak ditemukan.");
  return enqueueDispatch(device.id, device.userId, { number: phone, message, image: mediaUrl, transaction_id: randomUUID() });
}
