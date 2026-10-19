import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import http from "node:http";
import https from "node:https";
import { getPreviewFromContent } from "link-preview-js";
import type { WAUrlInfo } from "@whiskeysockets/baileys";

const blocked = new BlockList();
for (const [ip, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 3],
] as [string, number][]) blocked.addSubnet(ip, prefix, "ipv4");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
blocked.addSubnet("2001::", 32, "ipv6");
blocked.addSubnet("2001:db8::", 32, "ipv6");
blocked.addSubnet("2002::", 16, "ipv6");
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  return family === 4 ? !blocked.check(address, "ipv4") : family === 6 && globalV6.check(address, "ipv6") && !blocked.check(address, "ipv6");
}

async function fetchPage(url: URL, deadline: number, redirects = 0): Promise<{ url: string; data: string; headers: Record<string, string>; status: number }> {
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || (url.port && !["80", "443"].includes(url.port))) throw new Error("Unsupported preview URL");
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const records = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await lookup(hostname, { all: true });
  if (!records.length || records.some(r => !isPublicAddress(r.address))) throw new Error("Private preview destination");
  const address = records[0];
  const timeout = deadline - Date.now();
  if (timeout <= 0) throw new Error("Preview timed out");
  return new Promise((resolve, reject) => {
    // Pin the vetted DNS result while preserving Host and TLS SNI for HTTPS.
    const request = (url.protocol === "https:" ? https : http).get(url, {
      agent: false, family: address.family,
      lookup: ((host: string, options: unknown, callback: any) => callback(null, address.address, address.family)) as any,
      headers: { "User-Agent": "Doran-LinkPreview/1.0", Accept: "text/html", "Accept-Encoding": "identity" },
    }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode || 0) && response.headers.location) {
        response.resume();
        if (redirects >= 3) return reject(new Error("Too many preview redirects"));
        fetchPage(new URL(response.headers.location, url), deadline, redirects + 1).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200 || !response.headers["content-type"]?.includes("text/html")) {
        response.resume(); return reject(new Error("Unsupported preview response"));
      }
      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on("data", (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 1024 * 1024) request.destroy(new Error("Preview too large"));
        else chunks.push(chunk);
      });
      response.on("error", reject);
      response.on("end", () => resolve({ url: url.href, data: Buffer.concat(chunks).toString("utf8"), headers: { "content-type": response.headers["content-type"] || "text/html" }, status: 200 }));
    });
    const timer = setTimeout(() => request.destroy(new Error("Preview timed out")), timeout);
    request.on("close", () => clearTimeout(timer));
    request.on("error", reject);
  });
}

export async function safeLinkPreview(text: string): Promise<WAUrlInfo | undefined> {
  const matchedText = text.match(/https?:\/\/[^\s<>]+/i)?.[0];
  if (!matchedText) return undefined;
  try {
    // DNS lookup is bounded as well as the HTTP request; parser never fetches images.
    const page = await Promise.race([
      fetchPage(new URL(matchedText), Date.now() + 6500),
      new Promise<never>((_, reject) => { const timer = setTimeout(() => reject(new Error("Preview timed out")), 7000); timer.unref(); }),
    ]);
    const preview = await getPreviewFromContent(page);
    if (!("title" in preview)) return undefined;
    return { "canonical-url": page.url, "matched-text": matchedText, title: preview.title || "", description: preview.description || "" };
  } catch (error) { return undefined; }
}
