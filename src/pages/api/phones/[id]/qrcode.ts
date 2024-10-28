import type { NextApiRequest, NextApiResponse } from "next";

import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { WaSockQrTimeout } from "@/server/constant";
import makeWASocket from "@/server/libs/makeWASocket";
import { AuthNextApiRequest } from "@/types/global";
import { ConnectionState, WASocket } from "@whiskeysockets/baileys";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  switch (req.method) {
    case "GET":
      return GET(req, res);
    default:
      res.status(405).end();
  }
}

const GET = async (req: AuthNextApiRequest, res: NextApiResponse) => {
  const phoneId = req.query.id as string;
  try {
    const waSock = await makeWASocket(req?.user?.id!, phoneId);
    const qr = await getQrCode(waSock);
    res.status(200).json({ qr, timeout: WaSockQrTimeout });
  } catch (err) {
    res.status(500).end();
  }
};

const getQrCode = async (waSock: WASocket): Promise<string> => {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("QR code generation timed out"));
    }, 60000); // 60 seconds timeout
    const updateEvent = (update: Partial<ConnectionState>) => {
      if (update.qr) {
        clearTimeout(timeout); // Clear timeout when QR code is received
        resolve(update.qr);
        waSock.ev.off("connection.update", updateEvent);
      }
    };

    waSock.ev.on("connection.update", updateEvent);
  });
};

export default apiAuthMiddleware(handler);
