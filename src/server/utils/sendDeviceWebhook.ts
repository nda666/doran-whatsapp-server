import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import http from "node:http";
import https from "node:https";
import { isPublicAddress } from "./safeLinkPreview";
export type WebhookHttpResponse = { status: number; body: string };
export async function sendDeviceWebhook(endpoint: string, payload: unknown, headers: Record<string, string> = {}, onResponse?: (response: WebhookHttpResponse) => void) {
  const url = new URL(endpoint), host = url.hostname.replace(/^\[|\]$/g, "");
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || (url.port && !["80", "443"].includes(url.port))) throw new Error("INVALID_WEBHOOK_URL");
  let dnsTimer: ReturnType<typeof setTimeout> | undefined;
  const records = isIP(host) ? [{ address: host, family: isIP(host) }] : await Promise.race([
    lookup(host, { all: true }),
    new Promise<never>((_, reject) => { dnsTimer = setTimeout(() => reject(new Error("WEBHOOK_DNS_TIMEOUT")), 5000); }),
  ]).finally(() => { if (dnsTimer) clearTimeout(dnsTimer); });
  if (!records.length || records.some(r => !isPublicAddress(r.address))) throw new Error("PRIVATE_WEBHOOK_ADDRESS");
  const data = JSON.stringify(payload), record = records[0];
  return new Promise<void>((resolve, reject) => {
    const request = (url.protocol === "https:" ? https : http).request(url, {
      method: "POST", agent: false, family: record.family,
      lookup: ((_host: string, _options: unknown, callback: any) => callback(null, record.address, record.family)) as any,
      headers: { ...headers, "Content-Type": "application/json", "Accept": "application/json", "Content-Length": Buffer.byteLength(data) },
    }, response => {
      let size = 0; const chunks: Buffer[] = [];
      response.on("data", chunk => { size += chunk.length; if (size > 65536) request.destroy(new Error("WEBHOOK_RESPONSE_TOO_LARGE")); else if (onResponse) chunks.push(Buffer.from(chunk)); });
      response.on("error", reject); response.on("end", () => {
        onResponse?.({ status: response.statusCode || 0, body: Buffer.concat(chunks).toString("utf8") });
        response.statusCode && response.statusCode >= 200 && response.statusCode < 300 ? resolve() : reject(new Error("WEBHOOK_HTTP_ERROR"));
      });
    });
    const timer = setTimeout(() => request.destroy(new Error("WEBHOOK_TIMEOUT")), 10000);
    request.on("close", () => clearTimeout(timer)); request.on("error", reject); request.end(data);
  });
}
