import { ownerScope } from "@/lib/access";
import type { NextApiResponse } from "next";
import fs from "node:fs/promises";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { AuthNextApiRequest } from "@/types/global";
import { prisma } from "@/lib/prisma";
import { assetPath } from "@/server/campaigns/media";
import { z } from "zod";
async function handler(req: AuthNextApiRequest, res: NextApiResponse) {
  const asset = await prisma.mediaAsset.findFirst({ where: { id: String(req.query.id), ...ownerScope(req.user!) } });
  if (!asset) return res.status(404).end();
  if (req.method === "PATCH") {
    const parsed = z.object({ name: z.string().trim().min(1).max(255) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Label file wajib diisi (maksimal 255 karakter)." });
    await prisma.$transaction(async tx => {
      // Legacy uploads kept their original filename in name until labels were introduced.
      await tx.mediaAsset.updateMany({ where: { id: asset.id, originalName: null }, data: { originalName: asset.name } });
      await tx.mediaAsset.update({ where: { id: asset.id }, data: parsed.data });
    });
    return res.json({ message: "Label file tersimpan." });
  }
  if (req.method === "DELETE") {
    if (await prisma.waDispatch.count({ where: { mediaId: asset.id } })) return res.status(409).json({ message: "File masih dipakai dalam riwayat/antrean." });
    await prisma.mediaAsset.delete({ where: { id: asset.id } });
    await fs.unlink(assetPath(asset.filename)).catch(() => {});
    return res.json({ result: true });
  }
  if (req.method !== "GET") return res.status(405).end();
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Type", asset.mime);
  const inline = /^(image|video|audio)\//.test(asset.mime);
  res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(asset.originalName || asset.name)}`);
  return res.send(await fs.readFile(assetPath(asset.filename)));
}
export default apiAuthMiddleware(handler);
