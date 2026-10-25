import { tableQuery } from "@/lib/tableQuery";
import { mediaSearchWhere } from "@/lib/mediaFilters";
import { isSuperAdmin, ownerScope, phoneScope } from "@/lib/access";
import type { NextApiResponse } from "next";
import formidable from "formidable";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { AuthNextApiRequest } from "@/types/global";
import { prisma } from "@/lib/prisma";
import { mediaDirectory } from "@/server/campaigns/media";
import { photoToSticker } from "@/server/campaigns/sticker";
import path from "node:path";
import { z } from "zod";
const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp", "video/mp4": "mp4", "audio/mpeg": "mp3", "audio/ogg": "ogg", "application/pdf": "pdf", "application/msword": "doc", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx", "text/plain": "txt" };
async function handler(req: AuthNextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  let userId = req.user!.id;
  if (req.method === "GET") {
    const { page, limit, skip, orderBy } = tableQuery(req.query, ["name", "mime", "size", "createdAt"], "createdAt", "desc");
    const options = req.query.options === "1";
    const where = { ...ownerScope(req.user!), ...mediaSearchWhere(req.query) };
    const [data, total] = await Promise.all([prisma.mediaAsset.findMany({ where, orderBy, take: options ? 1000 : limit, skip: options ? 0 : skip, select: { id: true, name: true, originalName: true, mime: true, size: true, createdAt: true } }), prisma.mediaAsset.count({ where })]);
    return res.json({ data, total });
  }
  if (req.method !== "POST") return res.status(405).end();
  // Test Kirim uploads belong to the sender's owner, matching its media/send checks.
  if (req.query.phoneId !== undefined) {
    if (typeof req.query.phoneId !== "string") return res.status(400).json({ message: "Perangkat tidak valid." });
    const phone = await prisma.phone.findFirst({ where: { id: req.query.phoneId, ...phoneScope(req.user!) }, select: { userId: true } });
    if (!phone) return res.status(404).json({ message: "Perangkat tidak ditemukan." });
    userId = isSuperAdmin(req.user!) ? phone.userId : req.user!.id;
  }
  if (!isSuperAdmin(req.user!) && await prisma.mediaAsset.count({ where: { userId } }) >= 1000) return res.status(400).json({ message: "Maksimal 1.000 file per pengguna." });
  const uploadDir = mediaDirectory(); await fs.mkdir(uploadDir, { recursive: true });
  const created: string[] = [];
  let unsupported = false;
  const form = formidable({ uploadDir, maxFiles: 10, maxFileSize: 25 * 1024 * 1024, maxTotalFileSize: 100 * 1024 * 1024,
    maxFields: 2, maxFieldsSize: 10000, filter: part => { const supported = !!extensions[part.mimetype || ""]; if (!supported) unsupported = true; return supported; },
    filename: (_name, _ext, part) => `${randomUUID()}.${extensions[part.mimetype || ""]}` });
  form.on("fileBegin", (_name, file) => created.push(file.filepath));
  try {
    const { fields, files } = await new Promise<{ fields: formidable.Fields; files: formidable.Files }>((resolve, reject) => form.parse(req, (err, fields, files) => err ? reject(err) : resolve({ fields, files })));
    const selected = Object.values(files).flat().filter((file): file is formidable.File => !!file);
    if (unsupported || !selected.length || selected.length > 10) throw new Error("Gunakan format file yang didukung, maksimal 10 file.");
    const rawLabels = fields.labels?.[0];
    const labels = rawLabels ? z.array(z.string().trim().min(1).max(255)).parse(JSON.parse(rawLabels)) : selected.map(file => (file.originalFilename || "media").slice(0, 255));
    if (labels.length !== selected.length) throw new Error("Isi label untuk setiap file.");
    const asSticker = fields.asSticker?.[0];
    if (asSticker && asSticker !== "1") throw new Error("Pilihan stiker tidak valid.");
    if (asSticker === "1") {
      for (const file of selected) {
        const output = await photoToSticker(await fs.readFile(file.filepath));
        const filename = `${randomUUID()}.webp`;
        const outputPath = path.join(uploadDir, filename);
        created.push(outputPath);
        await fs.writeFile(outputPath, output, { flag: "wx" });
        await fs.unlink(file.filepath);
        file.filepath = outputPath;
        file.newFilename = filename;
        file.mimetype = "image/webp";
        file.size = output.length;
        file.originalFilename = `${(file.originalFilename || "stiker").replace(/\.[^.]+$/, "").slice(0, 249)}.webp`;
      }
    }
    const assets = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
      if (!isSuperAdmin(req.user!) && await tx.mediaAsset.count({ where: { userId } }) + selected.length > 1000) throw new Error("Maksimal 1.000 file per pengguna.");
      const result = [];
      for (let index = 0; index < selected.length; index++) {
        const file = selected[index];
        result.push(await tx.mediaAsset.create({ data: { userId, name: labels[index], originalName: (file.originalFilename || "media").slice(0, 255), filename: file.newFilename, mime: file.mimetype!, size: file.size } }));
      }
      return result;
    });
    const data = assets.map(asset => ({ id: asset.id, name: asset.name, originalName: asset.originalName, mime: asset.mime, size: asset.size }));
    return res.status(201).json(rawLabels ? { data, message: `${assets.length} file tersimpan.` } : data[0]);
  } catch { await Promise.all(created.map(p => fs.unlink(p).catch(() => {}))); return res.status(400).json({ message: "Unggahan gagal. Isi label tiap file; maksimal 10 file, 25 MB/file dan total 100 MB. Untuk stiker, gunakan JPG, PNG, atau WebP statis yang valid (maksimal 40 megapiksel)." }); }
}
export default apiAuthMiddleware(handler);
export const config = { api: { bodyParser: false } };
