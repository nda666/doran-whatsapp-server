import fs from "node:fs/promises";
import path from "node:path";
import type { MediaAsset } from "@prisma/client";
import type { AnyMessageContent } from "@whiskeysockets/baileys";
import { prisma } from "../../lib/prisma";
import { isApproved, isSuperAdmin } from "../../lib/access";
export const mediaDirectory = () => path.join(process.cwd(), "storage", "campaign-media");
export function assetPath(filename: string) {
  if (!/^[a-f0-9-]{36}\.[a-z0-9]+$/i.test(filename)) throw new Error("INVALID_MEDIA_PATH");
  return path.join(mediaDirectory(), filename);
}
export async function loadAssetContent(asset: MediaAsset, userId: string, caption: string): Promise<AnyMessageContent> {
  if (asset.userId !== userId) {
    const actor = await prisma.user.findUnique({ where: { id: userId } });
    if (!actor || !isApproved(actor) || !isSuperAdmin(actor)) throw new Error("MEDIA_NOT_OWNED");
  }
  const buffer = await fs.readFile(assetPath(asset.filename));
  if (buffer.length > 25 * 1024 * 1024) throw new Error("MEDIA_TOO_LARGE");
  if (asset.mime.startsWith("image/")) return { image: buffer, caption };
  if (asset.mime.startsWith("video/")) return { video: buffer, caption };
  if (asset.mime.startsWith("audio/")) return { audio: buffer, mimetype: asset.mime };
  return { document: buffer, mimetype: asset.mime, fileName: asset.originalName || asset.name, caption };
}
