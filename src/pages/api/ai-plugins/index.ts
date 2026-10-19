import type { NextApiResponse } from "next";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import type { AuthNextApiRequest } from "@/types/global";
import { prisma } from "@/lib/prisma";
import { aiPluginInput } from "@/lib/aiPlugins";
import { encryptAiKey } from "@/server/ai/secrets";
const publicFields = { id: true, provider: true, enabled: true, model: true, systemPrompt: true,
  maxOutputTokens: true, requestsPerMinute: true, dailyLimit: true, updatedAt: true } as const;

async function handler(req: AuthNextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  const userId = req.user!.id;
  if (req.method === "GET") {
    const [configs, recent] = await Promise.all([
      prisma.aiPlugin.findMany({ where: { userId }, select: { ...publicFields, encryptedKey: true } }),
      prisma.aiRequest.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, provider: true, status: true, error: true, createdAt: true } }),
    ]);
    return res.json({ data: configs.map(({ encryptedKey, ...row }) => ({ ...row, hasKey: !!encryptedKey })), recent,
      encryptionReady: /^[a-fA-F0-9]{64}$/.test(process.env.AI_SECRET_KEY || "") });
  }
  if (req.method !== "POST") return res.status(405).end();
  const parsed = aiPluginInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Pengaturan AI tidak valid. Periksa model, instruksi, dan batas permintaan." });
  const { apiKey, removeKey, ...data } = parsed.data;
  if (removeKey && apiKey) return res.status(400).json({ message: "Pilih hapus atau ganti API key." });
  let encryptedKey: string | undefined;
  if (apiKey) {
    try { encryptedKey = encryptAiKey(apiKey); }
    catch { return res.status(503).json({ message: "AI_SECRET_KEY server belum valid. Isi 64 karakter hex sebelum menyimpan API key." }); }
  }
  const existing = await prisma.aiPlugin.findUnique({ where: { userId_provider: { userId, provider: data.provider } } });
  const key = removeKey ? "" : encryptedKey ?? existing?.encryptedKey ?? "";
  if (data.enabled && !key) return res.status(400).json({ message: "Isi API key sebelum mengaktifkan plugin." });
  if (data.enabled && !/^[a-fA-F0-9]{64}$/.test(process.env.AI_SECRET_KEY || "")) return res.status(503).json({ message: "AI_SECRET_KEY server belum valid." });
  const saved = await prisma.aiPlugin.upsert({ where: { userId_provider: { userId, provider: data.provider } },
    create: { ...data, userId, encryptedKey: key }, update: { ...data, encryptedKey: key }, select: publicFields });
  return res.json({ ...saved, hasKey: !!key });
}
export default apiAuthMiddleware(handler);
export const config = { api: { bodyParser: { sizeLimit: "32kb" } } };
