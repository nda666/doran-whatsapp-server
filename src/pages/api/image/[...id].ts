import { isApproved, ownerScope } from "@/lib/access";
import { readFile, realpath, stat } from "fs/promises";
import type { NextApiResponse } from "next";
import path from "path";
import { prisma } from "@/lib/prisma";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { AuthNextApiRequest } from "@/types/global";
import { verifyMediaSignature } from "@/server/utils/mediaUrl";
const mime: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif", ".webp": "image/webp" };
async function handler(req: AuthNextApiRequest & { signedMedia?: boolean }, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();
  const segments = req.query.id;
  if (!Array.isArray(segments) || segments.length !== 2 || !["uploads", "downloaded-image"].includes(segments[0]) || segments[1].includes("\\") || segments[1].includes("/") || segments[1].includes("..")) return res.status(404).end();
  const root = path.join(process.cwd(), "storage", segments[0]);
  const candidate = path.join(root, segments[1]);
  const contentType = mime[path.extname(candidate).toLowerCase()];
  if (!contentType) return res.status(404).end();
  try {
    const resolved = await realpath(candidate);
    if (path.dirname(resolved) !== root) return res.status(404).end();
    if (segments[0] === "downloaded-image" && !req.signedMedia) {
      const rel = segments.join("/");
      const record = await prisma.inboxMessage.findFirst({ where: { ...ownerScope(req.user!), image_in: { in: [candidate, rel, `storage/${rel}`] } }, select: { id: true } });
      if (!record) return res.status(404).end();
    } else if (segments[0] === "uploads") {
      const phoneId = segments[1].match(/^\d+_([0-9a-f-]{36})\./i)?.[1];
      if (!phoneId || !await prisma.phone.findFirst({ where: { id: phoneId, ...ownerScope(req.user!) }, select: { id: true } })) return res.status(404).end();
    }
    const info = await stat(resolved);
    if (!info.isFile() || info.size > 25 * 1024 * 1024) return res.status(413).end();
    res.setHeader("Content-Type", contentType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).send(await readFile(resolved));
  } catch (error) { return res.status(404).end(); }
}
export default async function authenticatedMedia(req: AuthNextApiRequest & { signedMedia?: boolean }, res: NextApiResponse) {
  const id = req.query.id;
  if (req.method === "GET" && Array.isArray(id)) {
    const owner = verifyMediaSignature(req.query.owner, id.join("/"), req.query.expires, req.query.signature);
    if (owner) {
      const user = await prisma.user.findUnique({ where: { id: owner } });
      if (user && isApproved(user)) { req.user = user; req.signedMedia = true; return handler(req, res); }
    }
  }
  return apiAuthMiddleware(handler)(req, res);
}
