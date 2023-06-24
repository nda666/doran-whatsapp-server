import makeWASocket from "@/lib/makeWASocket";
import { prisma } from "@/lib/prisma";
import { AuthNextApiRequest } from "@/types/global";
import { SendMessageValidation } from "@/validations/sendMessage";
import { delay } from "@whiskeysockets/baileys";
import { CountryCode, parsePhoneNumber } from "libphonenumber-js";
import { NextApiResponse } from "next";

let retry = 0;
interface SendMessageRequest extends AuthNextApiRequest {
  body: {
    number?: string;
    message?: string;
    api_key?: string;
    phoneCountry?: string;
  };
}

const handler = async (req: SendMessageRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.status(405).send("");
    return;
  }
  retry = 0;
  const validation = await SendMessageValidation(req.body);
  if (!validation?.result) {
    res.status(200).json(validation?.error);
    return;
  }
  await sendMessage(req, res);
};

const sendMessage = async (req: SendMessageRequest, res: NextApiResponse) => {
  const { number, message, api_key, phoneCountry } = req.body;

  const tos = (number as string).split(",");

  const phone = await prisma.phone.findUnique({
    where: {
      token: api_key,
    },
  });
  if (!phone) {
    res.status(200).json({ result: false, message: "Token tidak valid" });
    return;
  }

  const socket = await makeWASocket(phone.userId, phone.id);

  try {
    let send: any = [];
    for (const _to of tos) {
      const parsedTo = parsePhoneNumber(
        _to,
        (phoneCountry || "ID") as CountryCode
      );
      const sendResult = await socket.sendMessage(
        `${parsedTo.countryCallingCode}${parsedTo.nationalNumber}@s.whatsapp.net`,
        {
          text: message!,
        }
      );
      send.push(sendResult);
    }
    res.status(200).json({ result: true, data: send });
    return;
  } catch (e: any) {
    if (e?.output?.statusCode === 428 && retry < 5) {
      retry++;
      await delay(2000);
      await sendMessage(req, res);
      return;
    }
    res.status(200).json({ result: false, error: e });
    return;
  }
};

export default handler;
