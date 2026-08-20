import axios from "axios";
import { prisma } from "../lib/prisma";

export interface PhoneStatusWebhookData {
  phoneId: string;
  isOnline?: boolean;
  status?: string | null;
  connection?: string;
  lastDisconnect?: {
    statusCode?: number;
    message?: string;
  } | null;
  qr?: string | null;
  timestamp?: string;
  phone?: {
    id: string;
    name: string;
    number: string | null;
    account_name: string | null;
    isOnline: boolean;
    status: string | null;
    active: number;
    createdAt?: Date;
    updatedAt?: Date;
  } | null;
}

/**
 * State untuk rate limiting per-URL
 */
interface UrlQueueState {
  lastSentTime: number;
  timer: NodeJS.Timeout | null;
  pendingPayload: any | null;
  lastPayloadSignature: string | null;
}

const urlQueues = new Map<string, UrlQueueState>();

/**
 * Mendapatkan konfigurasi rate limit delay (ms) per URL dari env
 * Default: 2000ms (2 detik)
 */
export const getRateLimitMs = (): number => {
  const raw = process.env.WEBHOOK_RATE_LIMIT_MS;
  if (raw && !isNaN(Number(raw))) {
    return Math.max(500, Number(raw));
  }
  return 2000;
};

/**
 * Mendapatkan daftar webhook URL dari process.env.WEBHOOK_URLS
 * Mendukung format comma-separated atau JSON array string.
 */
export const getWebhookUrls = (): string[] => {
  const rawUrls = process.env.WEBHOOK_URLS?.trim();
  if (!rawUrls) {
    return [];
  }

  // Jika berupa JSON array
  if (rawUrls.startsWith("[") && rawUrls.endsWith("]")) {
    try {
      const parsed = JSON.parse(rawUrls);
      if (Array.isArray(parsed)) {
        return parsed
          .map((url) => String(url).trim())
          .filter((url) => url.startsWith("http://") || url.startsWith("https://"));
      }
    } catch {
      // fallback to comma separated
    }
  }

  // Comma separated string
  return rawUrls
    .split(",")
    .map((url) => url.trim())
    .filter((url) => url.startsWith("http://") || url.startsWith("https://"));
};

/**
 * Melakukan HTTP POST request aktual ke target URL
 */
const executeHttpPost = async (url: string, body: any) => {
  try {
    await axios.post(url, body, {
      timeout: 5000,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Doran-WhatsApp-Server-Webhook/1.0",
      },
    });
  } catch (err: any) {
    console.error(`[Webhook Error] Failed to send webhook to ${url}:`, err?.message || err);
  }
};

/**
 * Mengirim webhook ke URL tertentu dengan Rate Limiting & Debouncing per-URL
 */
const dispatchToUrlWithRateLimit = async (url: string, body: any) => {
  let state = urlQueues.get(url);
  if (!state) {
    state = {
      lastSentTime: 0,
      timer: null,
      pendingPayload: null,
      lastPayloadSignature: null,
    };
    urlQueues.set(url, state);
  }

  const rateLimitMs = getRateLimitMs();
  const now = Date.now();

  // Signature untuk mencegah duplicate event yang sama persis dalam waktu berdekatan
  const signature = `${body.event}:${body.data?.phoneId || ""}:${body.data?.status || ""}:${body.data?.isOnline ?? ""}:${body.data?.connection || ""}`;

  // Jika payload sama persis dengan yang baru saja dikirim (< 5 detik yang lalu), skip duplicate
  if (state.lastPayloadSignature === signature && now - state.lastSentTime < 5000) {
    return;
  }

  const timeSinceLastSent = now - state.lastSentTime;

  // Jika waktu cooldown sudah terpenuhi dan tidak ada timer berjalan, kirim sekarang
  if (timeSinceLastSent >= rateLimitMs && !state.timer) {
    state.lastSentTime = now;
    state.lastPayloadSignature = signature;
    await executeHttpPost(url, body);
    return;
  }

  // Jika masih dalam periode cooldown, simpan sebagai pending (trailing update)
  state.pendingPayload = body;
  state.lastPayloadSignature = signature;

  if (!state.timer) {
    const delay = Math.max(100, rateLimitMs - timeSinceLastSent);
    state.timer = setTimeout(async () => {
      if (!state) return;
      state.timer = null;
      if (state.pendingPayload) {
        const payloadToSend = state.pendingPayload;
        state.pendingPayload = null;
        state.lastSentTime = Date.now();
        await executeHttpPost(url, payloadToSend);
      }
    }, delay);
  }
};

/**
 * Mengirim notifikasi webhook ke seluruh URL yang terdaftar dengan per-URL rate limit
 */
export const sendWebhookNotification = async (event: string, payload: any) => {
  const urls = getWebhookUrls();
  if (urls.length === 0) {
    return;
  }

  const body = {
    event,
    timestamp: new Date().toISOString(),
    data: payload,
  };

  const promises = urls.map((url) => dispatchToUrlWithRateLimit(url, body));
  await Promise.allSettled(promises);
};

/**
 * Helper untuk broadcast event status phone ke semua webhook
 */
export const broadcastPhoneStatusUpdate = async (params: {
  phoneId: string;
  isOnline?: boolean;
  status?: string | null;
  connection?: string;
  lastDisconnect?: any;
  qr?: string | null;
}) => {
  try {
    const phone = await prisma.phone.findUnique({
      where: {
        id: params.phoneId,
      },
      select: {
        id: true,
        name: true,
        number: true,
        account_name: true,
        status: true,
        isOnline: true,
        active: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const payload: PhoneStatusWebhookData = {
      phoneId: params.phoneId,
      isOnline: typeof params.isOnline !== "undefined" ? params.isOnline : phone?.isOnline,
      status: typeof params.status !== "undefined" ? params.status : phone?.status,
      connection: params.connection,
      lastDisconnect: params.lastDisconnect
        ? {
            statusCode: (params.lastDisconnect?.error as any)?.output?.statusCode,
            message: (params.lastDisconnect?.error as any)?.message,
          }
        : null,
      qr: params.qr || null,
      timestamp: new Date().toISOString(),
      phone: phone || null,
    };

    await sendWebhookNotification("phone.status", payload);
  } catch (error: any) {
    console.error("[Webhook Error] broadcastPhoneStatusUpdate error:", error?.message || error);
  }
};
