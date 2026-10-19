import { ownerScope } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { NextApiRequest, NextApiResponse } from "next";
import { AuthNextApiRequest } from "@/types/global";
import { updateDevice } from "@/server/deviceWebhook/events";

const handler = async (req: AuthNextApiRequest, res: NextApiResponse) => {
  if (req.method !== "PATCH") { res.setHeader("Allow", "PATCH"); return res.status(405).end(); }
  if (typeof req.body?.is_save_group !== "boolean") return res.status(400).json({ message: "Status simpan grup tidak valid." });

  const phoneId = req.query.id;
  const is_save_group = req.body.is_save_group;
  // return res.status(200).json({ok: 'ok', phoneId: phoneId});
  //
  const result = await prisma.$transaction(tx => updateDevice(tx, {
      id: String(phoneId),
      ...ownerScope(req.user!),
    }, { is_save_group }));

  if (!result) return res.status(404).json({ message: "Perangkat tidak ditemukan." });
  return res.status(200).json({ count: 1 });
};

export default apiAuthMiddleware(handler);
