import type { MediaAsset, WaDispatch } from "@prisma/client";
import { createHmac, timingSafeEqual } from "node:crypto";
import sharp from "sharp";
import { loadAssetContent } from "../campaigns/media";
import { loadDispatchImage } from "../dispatch/media";
import { reserveSend, recipientBlocked, SendGuardError } from "../messaging/safety";
import { prisma } from "../../lib/prisma";
import { createTelegramService, telegramConfig, TelegramResult } from "./service";
import { telegramEnabled } from "./availability";
import { isTelegramDevice } from "../../lib/messagingChannel";
import { normalizeTelegramPhone } from "./service";

export function telegramRecipient<T extends { recipient: string }>(job: T, phone: { channel?: string }): T {
  if (!isTelegramDevice(phone)) return job;
  const config = telegramConfig();
  if (!config.testMode) return job;
  if (!config.testPhone) throw new Error("Isi TELEGRAM_TEST_PHONE sebelum mengantrekan pesan Telegram dalam mode uji.");
  return { ...job, recipient: normalizeTelegramPhone(config.testPhone).slice(1) };
}

export type TelegramDispatch = WaDispatch & { media?: MediaAsset | null };
export function assertTelegramContent(payload: unknown, media?: { mime: string } | null) {
  if (payload || (media && !/^image\/(jpeg|png|gif|webp)$/.test(media.mime))) throw new Error("TELEGRAM_UNSUPPORTED_CONTENT");
}

function mediaSignature(job: Pick<WaDispatch, "id" | "payloadHash">, expiry: number) {
  const key = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!key) throw new Error("TELEGRAM_MEDIA_SIGNING_NOT_CONFIGURED");
  return createHmac("sha256", key).update(`telegram-media:${job.id}:${job.payloadHash}:${expiry}`).digest("hex");
}
export function telegramMediaUrl(job: WaDispatch, now = Date.now()) {
  const base = new URL(process.env.APP_URL || "");
  if (base.protocol !== "https:" || base.username || base.password) throw new Error("TELEGRAM_MEDIA_REQUIRES_PUBLIC_HTTPS_APP_URL");
  const expiry = Math.floor(now / 1000) + 600;
  const url = new URL(`/api/telegram/media/${job.id}`, base);
  url.searchParams.set("expires", String(expiry));
  url.searchParams.set("signature", mediaSignature(job, expiry));
  return url.href;
}
export function verifyTelegramMedia(job: WaDispatch, expires: string, signature: string, now = Date.now()) {
  const expiry = Number(expires);
  if (!/^\d+$/.test(expires) || !Number.isSafeInteger(expiry) || expiry * 1000 <= now || expiry * 1000 > now + 600_000 || !/^[a-f0-9]{64}$/.test(signature)) return false;
  return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(mediaSignature(job, expiry), "hex"));
}
export async function telegramImage(job: TelegramDispatch) {
  assertTelegramContent(job.payload, job.media);
  // Reuse File Manager ownership/admin authorization and size checks verbatim.
  const content = job.media ? await loadAssetContent(job.media, job.userId, job.message) : null;
  const data = content && "image" in content && Buffer.isBuffer(content.image) ? content.image : job.image ? await loadDispatchImage(job.image) : null;
  if (!data || data.length > 25 * 1024 * 1024) throw new Error("TELEGRAM_INVALID_IMAGE");
  const metadata = await sharp(data, { limitInputPixels: 40_000_000 }).metadata();
  if (!metadata.format || !["jpeg", "png", "webp", "gif"].includes(metadata.format)) throw new Error("TELEGRAM_INVALID_IMAGE");
  return { data, mime: `image/${metadata.format}` };
}

export async function prepareTelegramDispatch(job: TelegramDispatch) {
  assertTelegramContent(job.payload, job.media);
  const config = telegramConfig();
  // Validate settings and determine the actual recipient BEFORE suppression/quota.
  const service = createTelegramService(config);
  const mediaUrl = job.media || job.image ? telegramMediaUrl(job) : undefined;
  if (mediaUrl) await telegramImage(job);
  return { service, input: service.prepare({ phone: `+${job.recipient.replace(/^\+/, "")}`, message: job.message,
    mediaUrl, ...(mediaUrl ? { caption: job.message } : {}) }) };
}

export async function sendTelegramDispatch(job: TelegramDispatch, senderId: string, prepared: Awaited<ReturnType<typeof prepareTelegramDispatch>>) {
  if (!telegramEnabled()) throw new SendGuardError("TELEGRAM_DISABLED", new Date(Date.now() + 60000));
  const current = await prisma.phone.findFirst({ where: { id: senderId, userId: job.userId, active: 1, channel: "telegram" } });
  if (!current) throw new SendGuardError("DEVICE_INACTIVE", new Date(Date.now() + 60000));
  // Persist test routing before crossing the network boundary, so subsequent
  // configuration changes never restore a queued test to the original recipient.
  const actual = prepared.input.phone.replace(/^\+/, "");
  if (actual !== job.recipient) await prisma.waDispatch.update({ where: { id: job.id }, data: { recipient: actual } });
  const day = await reserveSend(job.userId, senderId, prepared.input.phone);
  if (await recipientBlocked(job.userId, actual)) throw new SendGuardError("RECIPIENT_OPTED_OUT");
  const result = await prepared.service.send(prepared.input, job.id);
  if (result.status !== "sent") await prisma.deviceDailyUsage.update({ where: { phoneId_day: { phoneId: senderId, day } }, data: { failures: { increment: 1 } } });
  return result;
}

export function telegramDispatchOutcome(result: TelegramResult, attempts: number, now = Date.now()) {
  if (result.status === "sent") return { status: "SENT" as const, sentAt: new Date(now), lastError: null };
  if (result.status === "rate_limited" && result.retryAfterMs !== undefined && attempts < 3) return {
    status: "QUEUED" as const, lastError: "TELEGRAM_FLOOD_RETRY", nextAttemptAt: new Date(now + result.retryAfterMs),
  };
  if (result.status === "unknown") return { status: "UNCERTAIN" as const, lastError: `TELEGRAM_${result.reason.toUpperCase()}` };
  return { status: "FAILED" as const, lastError: result.status === "rate_limited" ? attempts >= 3 ? "TELEGRAM_FLOOD_EXHAUSTED" : "TELEGRAM_FLOOD_NO_DELAY" : `TELEGRAM_${result.reason.toUpperCase()}` };
}
