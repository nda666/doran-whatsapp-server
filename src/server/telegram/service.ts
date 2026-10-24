import { request as httpsRequest } from "node:https";
import { randomUUID } from "node:crypto";
import { logger } from "../libs/logger";

export type TelegramInput = { phone: string; message: string; mediaUrl?: string; caption?: string };
export type TelegramResult = {
  status: "sent" | "failed" | "unknown" | "rate_limited";
  reason: string;
  requestId: string;
  httpStatus?: number;
  retryAfterMs?: number;
};
export type TelegramConfig = {
  baseUrl: string; apiKey: string; testMode: boolean; testPhone?: string;
  // No provider success schema has been supplied. Configure only after confirmation.
  successField?: string; successValue?: unknown;
};
type HttpResponse = { status: number; headers: Record<string, unknown>; body: string };
type Transport = (url: URL, key: string, payload: object) => Promise<HttpResponse>;
type Audit = (result: TelegramResult) => void;

export function telegramConfig(): TelegramConfig {
  const mode = process.env.TELEGRAM_TEST_MODE || "false";
  if (mode !== "true" && mode !== "false") throw new Error("Invalid TELEGRAM_TEST_MODE");
  return {
    baseUrl: process.env.TELEGRAM_BASE_URL || "https://tele.jeblast.com",
    apiKey: process.env.TELEGRAM_API_KEY || "",
    testMode: mode === "true", testPhone: process.env.TELEGRAM_TEST_PHONE,
    successField: process.env.TELEGRAM_SUCCESS_FIELD,
    successValue: process.env.TELEGRAM_SUCCESS_VALUE_JSON ? JSON.parse(process.env.TELEGRAM_SUCCESS_VALUE_JSON) : true,
  };
}

export function normalizeTelegramPhone(value: string): string {
  const clean = value.trim().replace(/[\s()-]/g, "");
  const phone = clean.startsWith("08") ? `+62${clean.slice(1)}` : clean;
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) throw new Error("Invalid Telegram phone");
  return phone;
}

class TransportFailure extends Error {
  constructor(public reason: string) { super(reason); }
}

// Native HTTPS: separate TLS connection deadline and total wall-clock deadline.
export const telegramHttp: Transport = (url, key, payload) => new Promise((resolve, reject) => {
  let connectionTimer: NodeJS.Timeout | undefined;
  let settled = false;
  let totalTimer: NodeJS.Timeout | undefined;
  const finish = (error?: Error, response?: HttpResponse) => {
    if (settled) return;
    settled = true;
    clearTimeout(totalTimer);
    clearTimeout(connectionTimer);
    if (error) reject(error); else resolve(response!);
  };
  const body = JSON.stringify(payload);
  const req = httpsRequest(url, {
    method: "POST", agent: false,
    headers: { "Content-Type": "application/json", "X-API-KEY": key, "Content-Length": Buffer.byteLength(body) },
  }, res => {
    const chunks: Buffer[] = [];
    let size = 0;
    res.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 1024 * 1024) req.destroy(new TransportFailure("response_too_large"));
      else chunks.push(chunk);
    });
    res.on("end", () => finish(undefined, { status: res.statusCode || 0, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
    res.on("error", () => finish(new TransportFailure("response_interrupted")));
    res.on("aborted", () => finish(new TransportFailure("response_interrupted")));
  });
  req.on("socket", socket => {
    connectionTimer = setTimeout(() => req.destroy(new TransportFailure("connection_timeout")), 10_000);
    socket.once("secureConnect", () => clearTimeout(connectionTimer));
  });
  req.on("error", error => finish(error));
  totalTimer = setTimeout(() => req.destroy(new TransportFailure("request_timeout")), 60_000);
  req.end(body);
});

function field(body: any, path: string): unknown {
  return path.split(".").reduce((value, key) => value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined, body);
}

// Retry-After is standard HTTP. JSON retry_after/parameters.retry_after are
// explicit seconds assumptions, pending confirmation of the provider schema.
function retryDelay(headers: Record<string, unknown>, body: any): number | undefined {
  const header = headers["retry-after"];
  const raw = header ?? body?.retry_after ?? body?.parameters?.retry_after;
  if (raw === undefined || raw === null || raw === "") return;
  const seconds = Number(raw);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : typeof raw === "string" ? Date.parse(raw) - Date.now() : NaN;
  if (Number.isFinite(ms) && ms >= 0 && ms <= 2_147_483_647) return Math.max(1000, Math.ceil(ms));
}

let auditLogger: ReturnType<typeof logger> | undefined;
const audit: Audit = result => {
  auditLogger ||= logger(`${process.env.WEBSITE_LOG || "./storage/logs/website"}/telegram.log`, "info");
  // Fixed reasons only: never log payloads, raw responses, URLs, keys or request errors.
  if (result.status === "sent") auditLogger.info(result, "telegram_delivery");
  else auditLogger.error(result, "telegram_delivery");
};

export function createTelegramService(config: TelegramConfig, transport: Transport = telegramHttp, log: Audit = audit) {
  // Capture test routing when creating the service / enqueueing, then persist the
  // resolved recipient so worker environment changes cannot restore a real number.
  function prepare(input: TelegramInput): TelegramInput {
    if (!config.apiKey.trim()) throw new Error("Missing TELEGRAM_API_KEY");
    const url = new URL(config.baseUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("Invalid Telegram base URL");
    if (!input.message?.trim()) throw new Error("Telegram message is required");
    if (input.caption !== undefined && !input.mediaUrl) throw new Error("Telegram caption requires mediaUrl");
    if (input.mediaUrl) {
      const media = new URL(input.mediaUrl);
      if (media.protocol !== "https:" || media.username || media.password) throw new Error("Telegram media URL must be public HTTPS");
    }
    if (config.testMode && !config.testPhone) throw new Error("Missing TELEGRAM_TEST_PHONE");
    return { ...input, phone: normalizeTelegramPhone(config.testMode ? config.testPhone! : input.phone) };
  }

  async function send(input: TelegramInput, requestId: string = randomUUID()): Promise<TelegramResult> {
    const finish = (result: Omit<TelegramResult, "requestId">) => {
      const full = { ...result, requestId };
      log(full);
      return full;
    };
    let prepared: TelegramInput;
    try { prepared = prepare(input); }
    catch { return finish({ status: "failed", reason: "invalid_input_or_configuration" }); }
    let response: HttpResponse;
    try {
      response = await transport(new URL("/api/send", config.baseUrl), config.apiKey, {
        phone: prepared.phone, peer_type: "user", message: prepared.message,
        ...(prepared.mediaUrl ? { media_url: prepared.mediaUrl } : {}),
        ...(prepared.caption !== undefined ? { caption: prepared.caption } : {}),
      });
    } catch (error) {
      // A socket error may occur after provider acceptance. Never auto-retry.
      return finish({ status: "unknown", reason: error instanceof TransportFailure ? error.reason : "network_error" });
    }
    const httpStatus = response.status;
    let body: any;
    try { body = JSON.parse(response.body); } catch { /* fail closed below */ }
    const errorText = body && typeof body === "object"
      ? [body.message, body.error, body.description, body.code, body.error_code, body.error?.message, body.error?.code].map(value => typeof value === "string" || typeof value === "number" ? String(value) : "").join(" ")
      : response.body;
    if ([401, 403].includes(httpStatus) || [401, 403].includes(Number(body?.error_code ?? body?.error?.code)) || /invalid.{0,20}(api.?key|token)|(api.?key|token).{0,20}invalid|unauthori[sz]ed/i.test(errorText)) return finish({ status: "failed", reason: "invalid_credentials", httpStatus });
    if (httpStatus === 404 || /not.?found|peer_id_invalid|phone_number_(invalid|unoccupied)|recipient.{0,20}(invalid|unknown)/i.test(errorText)) return finish({ status: "failed", reason: "recipient_not_found", httpStatus });
    if (httpStatus === 420 || /flood/i.test(errorText)) {
      return finish({ status: "rate_limited", reason: "provider_flood", httpStatus, retryAfterMs: retryDelay(response.headers, body) });
    }
    if (httpStatus < 200 || httpStatus >= 300) return finish({ status: "failed", reason: "http_error", httpStatus });
    const negative = body?.success === false || body?.ok === false || body?.result === false || body?.status === false || ["failed", "error", "failure"].includes(body?.status) || (body?.error !== undefined && body.error !== null && body.error !== false && body.error !== "") || (body?.error_code !== undefined && body.error_code !== 0);
    if (negative) return finish({ status: "failed", reason: "provider_rejected", httpStatus });
    if (body && config.successField && JSON.stringify(field(body, config.successField)) === JSON.stringify(config.successValue ?? true)) return finish({ status: "sent", reason: "confirmed_success", httpStatus });
    return finish({ status: "unknown", reason: "unrecognized_response", httpStatus });
  }
  return { prepare, send };
}

/** Trusted server convenience API. The application always uses the common queue
 * so device/global rules cannot be bypassed by this public helper. */
export function sendTelegram(phone: string, message: string, mediaUrl?: string, caption?: string) {
  return import("./queue").then(({ enqueueTelegram }) => enqueueTelegram(phone, message, mediaUrl, caption));
}
