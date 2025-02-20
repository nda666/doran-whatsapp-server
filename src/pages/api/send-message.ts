// import makeWASocket, { deleteSession } from "@/lib/makeWASocket";

import { NextApiResponse } from "next";

import { prisma } from "@/lib/prisma";
import sendMessageFromIo from "@/server/libs/sendMessageFromIo";
import { AuthNextApiRequest } from "@/types/global";
import { SendMessageValidation } from "@/validations/sendMessage";

let retry = 0;
interface SendMessageRequest extends AuthNextApiRequest {
  body: {
    number?: string;
    message?: string;
    api_key?: string;
    image?: any;
    phoneCountry?: string;
  };
}

const handler = async (req: SendMessageRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.status(405).send("");
    return;
  }
  // return res.status(2result00).json({'req': req.files});

  retry = 0;
  const validation = await SendMessageValidation(req.body);
  if (!validation?.result) {
    res.status(200).json(validation?.error);
    return;
  }
  await sendMessage(req, res);
};

const sendMessage = async (req: SendMessageRequest, res: NextApiResponse) => {
  const { number, message, api_key, phoneCountry, image } = req.body;
  const tos = (number as string).split(",");
  console.log(req.body);
  const phone = await prisma.phone.findUnique({
    where: {
      token: api_key,
    },
  });
  if (!phone) {
    res.status(200).json({ result: false, message: "Token tidak valid" });
    return;
  }

  const url = process.env.NEXT_PUBLIC_APP_URL?.toString();

  try {
    const resSocket = await sendMessageFromIo({
      phoneId: phone.id,
      userId: phone.userId,
      tos,
      phoneCountry: phoneCountry || "ID",
      message: message || "",
      image,
    });

    res.status(200).json({ result: true, data: resSocket });
  } catch (err) {
    res.status(200).json({ result: false, data: err });
  }
};

// const handler = async (req: NextApiRequest, res: NextApiResponse) => {
//   return res.status(200).json("ok");
// }

export default handler;
