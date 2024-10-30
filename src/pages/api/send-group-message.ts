import { NextApiResponse } from "next";

import { prisma } from "@/lib/prisma";
import sendGroupMessageFromIo from "@/server/libs/sendGroupMessageFromIo";
import { AuthNextApiRequest } from "@/types/global";

let retry = 0;
interface SendMessageRequest extends AuthNextApiRequest {
  body: {
    // number?: string;
    message?: string;
    api_key?: string;
    image?: any;
    phoneCountry?: string;
    id_group?: string;
  };
}

const handler = async (req: SendMessageRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.status(405).send("");
    return;
  }
  // return res.status(2result00).json({'req': req.files});
  retry = 0;
  // const validation = await SendMessageValidation(req.body);
  // if (!validation?.result) {
  //   res.status(200).json(validation?.error);
  //   return;
  // }
  await sendGroupMessage(req, res);
};

const isBase64 = (str: string) => {
  try {
    const decodeString = atob(str);

    const encodedString = btoa(decodeString);

    return encodedString === str;
  } catch (e) {
    return false;
  }
};

const sendGroupMessage = async (
  req: SendMessageRequest,
  res: NextApiResponse
) => {
  const {
    // number,
    message,
    api_key,
    phoneCountry,
    image,
    id_group,
  } = req.body;
  // const tos = (number as string).split(",");
  if (!id_group) {
    res.status(500).json({
      status: false,
      response: "group ID number not included",
    });
    return;
  }

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
    const resSocket = await sendGroupMessageFromIo({
      phoneId: phone.id,
      userId: phone.userId,
      phoneCountry: phoneCountry || "ID",
      message: message || "",
      id_group,
      image,
    });

    res.status(200).json({ result: true, data: resSocket });
  } catch (err) {
    res.status(200).json({ result: false, data: err });
  }
};

export default handler;
