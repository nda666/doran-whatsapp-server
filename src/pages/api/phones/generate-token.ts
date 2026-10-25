import { randomUUID } from "crypto";
import type { NextApiResponse } from "next";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { phoneScope as ownerScope } from "@/lib/access";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import type { AuthNextApiRequest } from "@/types/global";
import { updateDevice } from "@/server/deviceWebhook/events";

const input = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("selected"), ids: z.array(z.string().uuid()).min(1).max(1000) }).strict(),
  z.object({ scope: z.literal("all") }).strict(),
]);

async function handler(req: AuthNextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }
  const parsed = input.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Pilih nomor yang valid atau semua nomor." });
  const ids = parsed.data.scope === "selected" ? Array.from(new Set(parsed.data.ids)) : undefined;
  try {
    const count = await prisma.$transaction(async tx => {
      const phones = await tx.phone.findMany({
        where: { ...ownerScope(req.user!), ...(ids ? { id: { in: ids } } : {}) },
        select: { id: true }, orderBy: { id: "asc" },
      });
      if (ids && phones.length !== ids.length) throw new Error("PHONE_SELECTION_CHANGED");
      for (const phone of phones) {
        const updated = await updateDevice(tx, { id: phone.id, ...ownerScope(req.user!) }, { token: randomUUID() }, "device.token_rotated");
        if (!updated) throw new Error("PHONE_SELECTION_CHANGED");
      }
      return phones.length;
    }, { timeout: 60000 });
    return res.json({ result: true, count });
  } catch (error) {
    if (error instanceof Error && error.message === "PHONE_SELECTION_CHANGED") {
      return res.status(409).json({ message: "Pilihan nomor berubah atau tidak dapat diakses. Muat ulang dan pilih kembali. Tidak ada token yang diganti." });
    }
    throw error;
  }
}
export default apiAuthMiddleware(handler);
