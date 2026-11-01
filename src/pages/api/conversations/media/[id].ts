import type { NextApiResponse } from "next";
import { streamFile } from "@/server/utils/streamFile";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { AuthNextApiRequest } from "@/types/global";
import { prisma } from "@/lib/prisma";
import { phoneScope } from "@/lib/access";
import { chatMediaPath } from "@/server/chat/media";
import { z } from "zod";

export const config = { api: { responseLimit: false } };
export default apiAuthMiddleware(async (req: AuthNextApiRequest, res: NextApiResponse) => {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "GET" && req.method !== "HEAD") return res.status(405).end();
  const id = z.string().uuid().safeParse(req.query.id);
  if (!id.success) return res.status(400).end();
  const message = await prisma.chatMessage.findFirst({ where: { id: id.data, conversation: { phone: phoneScope(req.user!) } } });
  if (!message?.mediaPath) return res.status(404).end();
  const mime = message.mediaMime || "application/octet-stream";
  const inline = /^(image\/(jpeg|png|gif|webp)|video\/mp4|audio\/(mpeg|ogg|mp4|webm|wav))(;|$)/i.test(mime);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  res.setHeader("Content-Type", inline ? mime : "application/octet-stream");
  res.setHeader("Content-Disposition", `${inline && req.query.download !== "1" ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(message.mediaName || "Lampiran")}`);
  await streamFile(chatMediaPath(message.mediaPath), res, req.headers.range, req.method === "HEAD");
});
