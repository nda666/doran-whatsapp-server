import { ownerScope } from "@/lib/access";
import type { NextApiRequest, NextApiResponse } from "next";

import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { prisma } from "@/lib/prisma";
import { waitForQr } from "@/server/libs/qrState";
import { isPairingInProgress } from "@/server/libs/pairingState";
import makeWASocket from "@/server/libs/makeWASocket";
import { AuthNextApiRequest } from "@/types/global";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  switch (req.method) {
    case "GET":
      return GET(req, res);
    default:
      res.status(405).end();
  }
}

const GET = async (req: AuthNextApiRequest, res: NextApiResponse) => {
  if (process.env.WHATSAPP_ENABLED === "false") return res.status(503).json({ message: "Koneksi WhatsApp dinonaktifkan sementara." });
  const phoneId = req.query.id as string;
  res.setHeader("Cache-Control", "no-store");
  const phone = await prisma.phone.findFirst({ where: { id: phoneId, ...ownerScope(req.user!) } });
  if (!phone) return res.status(404).json({ message: "Perangkat tidak ditemukan." });
  if (phone.active !== 1) return res.status(409).json({ code: "DEVICE_INACTIVE", message: "Perangkat masih nonaktif. Aktifkan perangkat sebelum memindai QR." });
  try {
    if (isPairingInProgress(phoneId)) return res.status(200).json({ pairing: true, timeout: 0 });
    const waSock = await makeWASocket(phone.userId, phoneId);
    const result = await waitForQr(waSock);
    res.status(200).json(result);
  } catch (err) {
    res.status(503).json({ message: err instanceof Error ? err.message : "Gagal mendapatkan QR. Silakan coba lagi." });
  }
};

export default apiAuthMiddleware(handler);
