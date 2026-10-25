import { phoneScope as ownerScope } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { NextApiRequest, NextApiResponse } from "next";
import { AuthNextApiRequest } from "@/types/global";
import { updateDevice } from "@/server/deviceWebhook/events";

const handler = async (req: AuthNextApiRequest, res: NextApiResponse) => {
  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    return res.status(405).json({ message: "Method not allowed" });
  }
  if (req.body?.active !== 0 && req.body?.active !== 1) return res.status(400).json({ message: "Status perangkat harus 0 atau 1." });

  const phoneId = req.query.id;
  const active = req.body.active;

  const result = await prisma.$transaction(tx => updateDevice(tx, {
      id: String(phoneId),
      ...ownerScope(req.user!),
    }, { active: Number(active) }, "device.active_changed"));

  if (!result) return res.status(404).json({ message: "Perangkat tidak ditemukan." });
  return res.status(200).json({ count: 1 });
};

export default apiAuthMiddleware(handler);
