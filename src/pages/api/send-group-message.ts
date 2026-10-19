import { NextApiResponse } from "next";

import type { Phone } from "@prisma/client";
import sendGroupMessageFromIo from "@/server/libs/sendGroupMessageFromIo";
import { AuthNextApiRequest } from "@/types/global";
import { DispatchAuthError, resolveDispatchDevice } from "@/server/dispatchAuth";

let retry = 0;
interface SendMessageRequest extends AuthNextApiRequest {
  body: {
    // number?: string;
    message?: string;
    api_key?: string;
    token_api?: string;
    device_id?: string;
    image?: any;
    phoneCountry?: string;
    id_group?: string;
  };
}

const handler = async (req: SendMessageRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.status(405).json({ result: false, curl_error: null, message: "Metode tidak diizinkan." });
    return;
  }
  // return res.status(2result00).json({'req': req.files});
  retry = 0;
  req.body = { ...req.body };
  // const validation = await SendMessageValidation(req.body);
  // if (!validation?.result) {
  //   res.status(200).json({ result: false, curl_error: null, message: "Parameter pengiriman tidak valid." });
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
      result: false,
      curl_error: null,
      message: "ID grup wajib diisi.",
      status: false,
      response: "group ID number not included",
    });
    return;
  }

  let phone: Phone;
  try { phone = (await resolveDispatchDevice(req, req.body)).phone; }
  catch (error) {
    if (!(error instanceof DispatchAuthError)) throw error;
    return res.status(error.invalidToken ? 200 : error.status).json({ result: false, curl_error: null, message: error.message });
  }
  if (phone.active !== 1) return res.status(409).json({ result: false, curl_error: null, message: "Perangkat nonaktif. Aktifkan sebelum mengirim." });

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
    res.status(200).json({ result: false, curl_error: null, message: "Pengiriman gagal. Periksa status perangkat sebelum mencoba lagi." });
  }
};

export default handler;
