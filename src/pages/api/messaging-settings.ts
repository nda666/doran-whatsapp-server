import type { NextApiResponse } from "next";
import { z } from "zod";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { AuthNextApiRequest } from "@/types/global";
import { prisma } from "@/lib/prisma";
const input = z.object({ optOutEnabled: z.boolean(), offlineAlertsEnabled: z.boolean(), alertEmail: z.union([z.literal(""), z.string().email().max(254)]), offlineDelaySeconds: z.number().int().min(30).max(3600) });
export default apiAuthMiddleware(async (req: AuthNextApiRequest, res: NextApiResponse) => {
  res.setHeader("Cache-Control", "no-store");
  const userId = req.user!.id;
  if (req.method === "GET") return res.json(await prisma.messagingPreference.findUnique({ where: { userId } }) || { optOutEnabled: true, offlineAlertsEnabled: false, alertEmail: req.user!.email || "", offlineDelaySeconds: 90 });
  if (req.method !== "PUT") return res.status(405).end();
  const parsed = input.safeParse(req.body);
  if (!parsed.success || (parsed.data.offlineAlertsEnabled && !parsed.data.alertEmail)) return res.status(400).json({ message: "Isi pengaturan dan alamat email notifikasi yang valid." });
  return res.json(await prisma.messagingPreference.upsert({ where: { userId }, create: { userId, ...parsed.data }, update: parsed.data }));
});
