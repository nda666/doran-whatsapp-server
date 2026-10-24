import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import { telegramImage, verifyTelegramMedia } from "@/server/telegram/dispatch";

// Provider download link, scoped to one persisted dispatch and valid for 10 minutes.
// No session, API key or filesystem path is exposed in the URL.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") return res.status(405).end();
  if (typeof req.query.id !== "string" || typeof req.query.expires !== "string" || typeof req.query.signature !== "string") return res.status(404).end();
  try {
    const job = await prisma.waDispatch.findUnique({ where: { id: req.query.id }, include: { media: true } });
    if (!job || !verifyTelegramMedia(job, req.query.expires, req.query.signature)) return res.status(404).end();
    const phone = await prisma.phone.findFirst({ where: { id: job.senderPhoneId || job.phoneId, userId: job.userId, channel: "telegram" } });
    if (!phone) return res.status(404).end();
    const image = await telegramImage(job);
    res.setHeader("Content-Type", image.mime);
    return res.send(image.data);
  } catch { return res.status(404).end(); }
}
