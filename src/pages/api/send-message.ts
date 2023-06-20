import makeWASocket from "@/lib/makeWASocket";
import { prisma } from "@/lib/prisma";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { AuthNextApiRequest } from "@/types/global";
import { SendMessageValidation } from "@/validations/sendMessage";
import { DisconnectReason } from "@whiskeysockets/baileys";
import { PhoneNumber, parsePhoneNumber } from "libphonenumber-js";
import { NextApiRequest, NextApiResponse } from "next";
import { getToken } from "next-auth/jwt";
import { i18n } from "next-i18next";
import { ZodError } from "zod";

const handler = async (req: AuthNextApiRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.status(405).send("");
    return;
  }

  const validation = await SendMessageValidation(req.body);
  console.log(validation);
  if (!validation?.result) {
    res.status(200).json(validation?.error);
    return;
  }
  const { to, text, token, phoneCountry } = req.body;

  const tos = (to as string).split(",");

  const phone = await prisma.phone.findUnique({
    where: {
      token: token,
    },
  });
  if (!phone) {
    res.status(200).json({ result: false, message: "Token tidak valid" });
    return;
  }

  const socket = await makeWASocket(phone.userId, phone.id);

  socket.ev.on("connection.update", async (update) => {
    if (update.qr) {
      socket.ev.flush(true);
      res.status(200).json({
        result: false,
        error: "Please scan qr code from phone dashboard page",
      });
      return;
    }

    if (update.connection === "close") {
      socket.ev.flush(true);
      res.status(200).json({
        result: false,
        error: (update?.lastDisconnect?.error as any)?.output,
      });
      return;
    }

    if (update.connection === "open") {
      try {
        let send: any = [];
        for (const _to of tos) {
          const parsedTo = parsePhoneNumber(_to, phoneCountry || "ID");
          const sendResult = await socket.sendMessage(
            `${parsedTo.countryCallingCode}${parsedTo.nationalNumber}@s.whatsapp.net`,
            {
              text,
            }
          );
          send.push(sendResult);
        }
        socket.ev.flush(true);
        res.status(200).json({ result: true, data: send });
        return;
      } catch (e) {
        socket.ev.flush(true);
        res
          .status(200)
          .json({ result: false, error: "Something wrong with server" });
        return;
      }
    }
  });
};

export default handler;
