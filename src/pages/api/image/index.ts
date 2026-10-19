import { ownerScope } from "@/lib/access";
import formidable from "formidable";
import fs from "fs/promises";
import type { NextApiResponse } from "next";
import path from "path";
import { prisma } from "@/lib/prisma";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { AuthNextApiRequest } from "@/types/global";
export const config = { api: { bodyParser: false } };
const extensions: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp" };
async function handler(req: AuthNextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const phoneId = req.query.phone_id;
  if (typeof phoneId !== "string" || !/^[0-9a-f-]{36}$/i.test(phoneId) || !await prisma.phone.findFirst({ where: { id: phoneId, ...ownerScope(req.user!) }, select: { id: true } })) return res.status(404).end();
  const uploadDir = path.join(process.cwd(), "storage/uploads");
  await fs.mkdir(uploadDir, { recursive: true });
  const created: string[] = [];
  const form = formidable({ uploadDir, maxFiles: 1, maxFileSize: 25 * 1024 * 1024, maxTotalFileSize: 25 * 1024 * 1024,
    maxFields: 20, maxFieldsSize: 64 * 1024,
    filter: part => !!extensions[part.mimetype || ""],
    filename: (name, ext, part) => `${Date.now()}_${phoneId}${extensions[part.mimetype || ""] || ".bin"}`,
  });
  form.on("fileBegin", (name, file) => created.push(file.filepath));
  try {
    const files = await new Promise<formidable.Files>((resolve, reject) => form.parse(req, (error, fields, files) => error ? reject(error) : resolve(files)));
    if (!Object.values(files).some(v => v?.length)) return res.status(400).json({ message: "Format gambar tidak didukung" });
    return res.json({ done: "ok", file: files });
  } catch (error) {
    await Promise.all(created.map(p => fs.unlink(p).catch(() => {})));
    return res.status(400).json({ message: "Unggahan gagal atau melebihi 25 MB" });
  }
}
export default apiAuthMiddleware(handler);
