import { ownerScope } from "@/lib/access";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { AuthNextApiRequest } from "@/types/global";
import type { NextApiResponse } from "next";
import { phoneCleanupSchema, defaultCleanupOptions } from "@/lib/phoneCleanup";
import { cleanupPhone, PhoneCleanupError } from "@/server/cleanupPhone";
import { z } from "zod";
async function handler(req: AuthNextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "POST" || req.method === "DELETE") {
    const id = z.string().uuid().safeParse(req.query.id);
    const parsed = phoneCleanupSchema.safeParse(req.method === "DELETE" ? { ...defaultCleanupOptions, deleteRecord: true } : req.body);
    if (!id.success || !parsed.success) return res.status(400).json({ message: !parsed.success ? parsed.error.issues.map(i => i.message).join(" ") : "ID perangkat tidak valid." });
    try { return res.json(await cleanupPhone(id.data, ownerScope(req.user!), parsed.data)); }
    catch (error) {
      if (error instanceof PhoneCleanupError) return res.status(error.status).json({ message: error.message });
      console.error("PHONE_CLEANUP_FAILED");
      return res.status(500).json({ message: "Pembersihan belum selesai. Periksa status perangkat lalu coba kembali." });
    }
  }
  return res.status(405).end();
}
export default apiAuthMiddleware(handler);
