import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import http from "node:http";
import https from "node:https";
import { isPublicAddress } from "./safeLinkPreview";

export type SafeHttpResponse = { status: number; body: string };

/**
 * One outbound request to a user-supplied URL: public addresses only (DNS result is pinned), no redirects,
 * ports 80/443 only, bounded DNS time, total time and response size.
 */
export async function safeHttpRequest(endpoint: string, options: { method?: "GET" | "POST"; headers?: Record<string, string>; body?: string; timeoutMs?: number; maxBytes?: number } = {}): Promise<SafeHttpResponse> {
  const { method = "GET", headers = {}, body, timeoutMs = 10000, maxBytes = 262144 } = options;
  const url = new URL(endpoint), host = url.hostname.replace(/^\[|\]$/g, "");
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || (url.port && !["80", "443"].includes(url.port))) throw new Error("INVALID_WEBHOOK_URL");
  let dnsTimer: ReturnType<typeof setTimeout> | undefined;
  const records = isIP(host) ? [{ address: host, family: isIP(host) }] : await Promise.race([
    lookup(host, { all: true }),
    new Promise<never>((_, reject) => { dnsTimer = setTimeout(() => reject(new Error("WEBHOOK_DNS_TIMEOUT")), 5000); }),
  ]).finally(() => { if (dnsTimer) clearTimeout(dnsTimer); });
  if (!records.length || records.some(record => !isPublicAddress(record.address))) throw new Error("PRIVATE_WEBHOOK_ADDRESS");
  const record = records[0];
  return new Promise<SafeHttpResponse>((resolve, reject) => {
    const request = (url.protocol === "https:" ? https : http).request(url, {
      method, agent: false, family: record.family,
      lookup: ((_host: string, _options: unknown, callback: any) => callback(null, record.address, record.family)) as any,
      headers: { ...headers, ...(body !== undefined ? { "Content-Length": Buffer.byteLength(body) } : {}) },
    }, response => {
      const status = response.statusCode || 0;
      // Redirects could point at an internal address after the vetting above.
      if (status >= 300 && status < 400) { response.resume(); request.destroy(new Error("WEBHOOK_REDIRECT_BLOCKED")); return; }
      let size = 0; const chunks: Buffer[] = [];
      response.on("data", chunk => { size += chunk.length; if (size > maxBytes) request.destroy(new Error("WEBHOOK_RESPONSE_TOO_LARGE")); else chunks.push(Buffer.from(chunk)); });
      response.on("error", reject);
      response.on("end", () => resolve({ status, body: Buffer.concat(chunks).toString("utf8") }));
    });
    const timer = setTimeout(() => request.destroy(new Error("WEBHOOK_TIMEOUT")), timeoutMs);
    request.on("close", () => clearTimeout(timer));
    request.on("error", reject);
    request.end(body);
  });
}
