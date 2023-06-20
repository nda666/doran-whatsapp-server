import makeWASocket from "@/lib/makeWASocket";
import { prisma } from "@/lib/prisma";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { AuthNextApiRequest } from "@/types/global";
import { SendMessageValidation } from "@/validations/sendMessage";
import { DisconnectReason } from "@whiskeysockets/baileys";
import { PhoneNumber, parsePhoneNumber } from "libphonenumber-js";
import { NextApiRequest, NextApiResponse } from "next";
import { getToken } from "next-auth/jwt";
import { ZodError } from "zod";

const handler = async (req: AuthNextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.status(405).send("");
    return;
  }

  const validation = await SendMessageValidation(req.body, res);
  if (!validation?.result) {
    return;
  }
  const { to, text, token, phoneCountry } = req.body;

  const phone = await prisma.phone.findUnique({
    where: {
      token: token,
    },
  });
  if (!phone) {
    return res
      .status(200)
      .json({ result: false, message: "Token tidak valid" });
  }

  const parsedTo = parsePhoneNumber(to, phoneCountry || "ID");

  const socket = await makeWASocket(phone.userId, phone.id);

  socket.ev.on("connection.update", async (update) => {
    console.log("update", update);
    if (update.connection === "close") {
      socket.ev.flush(true);
      res.status(200).json({
        result: false,
        error: (update?.lastDisconnect?.error as any)?.output,
      });
      return;
    }
    if (update.connection === "open") {
      socket.ev.flush(true);
      try {
        const send = await socket.sendMessage(
          `${parsedTo.countryCallingCode}${parsedTo.nationalNumber}@s.whatsapp.net`,
          {
            text,
          }
        );
        res.status(200).json({ result: true, data: send });
        return;
      } catch (e) {
        res.status(200).json({ result: false, error: e });
        return;
      }
    }
  });
};

export default handler;
