import type { NextApiResponse } from "next";
import { z } from "zod";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import type { AuthNextApiRequest } from "@/types/global";
import { aiProviders } from "@/lib/aiPlugins";
import { requestAiReply } from "@/server/ai/service";
import { AiError } from "@/server/ai/providers";
async function handler(req: AuthNextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).end();
  const parsed = z.object({ provider: z.enum(aiProviders), message: z.string().trim().min(1).max(4000) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Pilih provider dan isi pesan uji, maksimal 4.000 karakter." });
  try {
    const result = await requestAiReply(req.user!.id, parsed.data.provider, parsed.data.message);
    return res.json({ text: result?.text });
  } catch (error) {
    if (error instanceof AiError) {
      // A failed provider test is an application result. Avoid gateway 5xx pages
      // replacing the safe, actionable error message at the edge proxy.
      return res.status(error.status >= 500 ? 422 : error.status).json({ code: error.code, message: error.message });
    }
    return res.status(500).json({ message: "Pengujian AI gagal. Periksa pengaturan server." });
  }
}
export default apiAuthMiddleware(handler);
export const config = { api: { bodyParser: { sizeLimit: "24kb" } } };
