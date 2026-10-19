import type { NextApiResponse } from "next";
import fs from "node:fs/promises";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { AuthNextApiRequest } from "@/types/global";
import { prisma } from "@/lib/prisma";
import { ownerScope } from "@/lib/access";
import { chatMediaPath } from "@/server/chat/media";
import { z } from "zod";

export const config = { api: { responseLimit: false } };
export default apiAuthMiddleware(async (req: AuthNextApiRequest, res: NextApiResponse) => {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET") return res.status(405).end();
  const id = z.string().uuid().safeParse(req.query.id);
  if (!id.success) return res.status(400).end();
  const message = await prisma.chatMessage.findFirst({ where: { id: id.data, conversation: { ...ownerScope(req.user!), phone: ownerScope(req.user!) } } });
  if (!message?.mediaPath) return res.status(404).end();
  let buffer: Buffer;
  try { buffer = await fs.readFile(chatMediaPath(message.mediaPath)); } catch { return res.status(404).end(); }
  const mime = message.mediaMime || "application/octet-stream";
  const inline = /^(image\/(jpeg|png|gif|webp)|video\/mp4|audio\/(mpeg|ogg|mp4|webm|wav))(;|$)/i.test(mime);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  res.setHeader("Content-Type", inline ? mime : "application/octet-stream");
  res.setHeader("Content-Disposition", `${inline && req.query.download !== "1" ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(message.mediaName || "Lampiran")}`);
  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (!match) return res.status(416).end();
    const start = Number(match[1]), end = match[2] ? Math.min(Number(match[2]), buffer.length - 1) : buffer.length - 1;
    if (start > end || start >= buffer.length) { res.setHeader("Content-Range", `bytes */${buffer.length}`); return res.status(416).end(); }
    res.setHeader("Content-Range", `bytes ${start}-${end}/${buffer.length}`);
    res.setHeader("Content-Length", end - start + 1);
    res.setHeader("Accept-Ranges", "bytes");
    return res.status(206).send(buffer.subarray(start, end + 1));
  }
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Length", buffer.length);
  return res.send(buffer);
});
