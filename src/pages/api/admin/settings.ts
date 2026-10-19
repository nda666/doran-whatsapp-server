import type { NextApiResponse } from "next";
import { z } from "zod";
import { execFile } from "node:child_process";
import { prisma } from "@/lib/prisma";
import apiSuperAdminMiddleware from "@/middleware/apiSuperAdminMiddleware";
import { AuthNextApiRequest } from "@/types/global";
async function handler(req: AuthNextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") return res.json({ settings: await prisma.serverSetting.findUnique({ where: { id: 1 } }), runtime: { nodeVersion: process.version,
    port: Number(process.env.PORT) || 3000, connected: true, whatsappEnabled: process.env.WHATSAPP_ENABLED !== "false", dispatchQueueEnabled: process.env.DISPATCH_QUEUE_ENABLED === "true", sslEnabled: process.env.SSL_CERTBOT_ENABLED === "true" } });
  if (req.method !== "POST") return res.status(405).end();
  if (req.body.action === "ssl") {
    const parsed = z.object({ domain: z.string().regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/), email: z.string().email().max(200) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Domain/email tidak valid." });
    if (process.platform !== "linux" || process.env.SSL_CERTBOT_ENABLED !== "true" || !process.env.SSL_WEBROOT) return res.status(409).json({ message: "SSL otomatis memerlukan VPS Linux, Certbot, SSL_WEBROOT, dan SSL_CERTBOT_ENABLED=true. Untuk cPanel gunakan AutoSSL hosting." });
    try {
      await new Promise<void>((resolve, reject) => execFile("certbot", ["certonly", "--webroot", "-w", process.env.SSL_WEBROOT!, "-d", parsed.data.domain, "--email", parsed.data.email, "--agree-tos", "--non-interactive"], { timeout: 90000, maxBuffer: 65536 }, error => error ? reject(error) : resolve()));
      return res.json({ message: "Sertifikat berhasil diterbitkan. Pasang pada konfigurasi web server dan aktifkan renewal Certbot." });
    } catch { return res.status(503).json({ message: "Certbot gagal. Periksa DNS, webroot, izin, dan log Certbot di VPS." }); }
  }
  const parsed = z.object({ serverType: z.enum(["VPS", "LOCALHOST", "SHARED_HOSTING"]), nodeUrl: z.string().url().max(2000), nodePort: z.number().int().min(1).max(65535) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).end();
  return res.json(await prisma.serverSetting.upsert({ where: { id: 1 }, create: { id: 1, ...parsed.data }, update: parsed.data }));
}
export default apiSuperAdminMiddleware(handler);
