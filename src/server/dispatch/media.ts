import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import http from "node:http";
import https from "node:https";
import { isPublicAddress } from "../utils/safeLinkPreview";

async function download(url: URL, deadline: number, redirects = 0): Promise<Buffer> {
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || (url.port && !["80", "443"].includes(url.port))) throw new Error("INVALID_MEDIA_URL");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await lookup(host, { all: true });
  if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) throw new Error("PRIVATE_MEDIA_URL");
  const ip = addresses[0];
  if (Date.now() >= deadline) throw new Error("MEDIA_TIMEOUT");
  return new Promise((resolve, reject) => {
    const req = (url.protocol === "https:" ? https : http).get(url, { agent: false, family: ip.family,
      lookup: ((_host: string, _options: unknown, callback: any) => callback(null, ip.address, ip.family)) as any,
      headers: { "Accept-Encoding": "identity" } }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode || 0) && response.headers.location) {
        response.resume();
        if (redirects >= 3) return reject(new Error("MEDIA_REDIRECT_LIMIT"));
        download(new URL(response.headers.location, url), deadline, redirects + 1).then(resolve, reject); return;
      }
      if (response.statusCode !== 200 || !/^image\/(png|jpeg|gif|webp)/i.test(response.headers["content-type"] || "")) { response.resume(); reject(new Error("MEDIA_RESPONSE_INVALID")); return; }
      const chunks: Buffer[] = []; let bytes = 0;
      response.on("data", chunk => { bytes += chunk.length; if (bytes > 5 * 1024 * 1024) req.destroy(new Error("MEDIA_TOO_LARGE")); else chunks.push(chunk); });
      response.on("error", reject); response.on("end", () => resolve(Buffer.concat(chunks)));
    });
    const timer = setTimeout(() => req.destroy(new Error("MEDIA_TIMEOUT")), Math.max(1, deadline - Date.now()));
    req.on("close", () => clearTimeout(timer)); req.on("error", reject);
  });
}

export async function loadDispatchImage(image: string): Promise<Buffer> {
  if (/^https?:\/\//i.test(image)) {
    let timer: NodeJS.Timeout;
    try { return await Promise.race([download(new URL(image), Date.now() + 14_000), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("MEDIA_TIMEOUT")), 15_000); })]); }
    finally { clearTimeout(timer!); }
  }
  const value = image.replace(/^data:image\/(png|jpeg|gif|webp);base64,/i, "");
  if (!/^[a-zA-Z0-9+/]+={0,2}$/.test(value)) throw new Error("INVALID_MEDIA_BASE64");
  const data = Buffer.from(value, "base64");
  if (!data.length || data.length > 5 * 1024 * 1024) throw new Error("MEDIA_TOO_LARGE");
  return data;
}
