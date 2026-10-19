import formidable, { IncomingForm } from "formidable";
import { NextApiRequest, NextApiResponse } from "next";

import type { Phone } from "@prisma/client";
import sendAttachmentMessageIo from "@/server/libs/sendAttachmentMessageIo";
import { SendAttachmentValidation } from "@/validations/sendAttachment";
import { deviceToken } from "@/server/deviceToken";
import { DispatchAuthError, resolveDispatchDevice } from "@/server/dispatchAuth";

// import IncomingForm from "formidable/Formidable";

function readFile(
  req: NextApiRequest,
  saveLocally?: boolean
): Promise<{ fields: formidable.Fields; files: formidable.Files }> {
  return new Promise((resolve, reject) => {
    return resolve;
  });
}

export const config = {
  api: {
    bodyParser: false, // Disable built-in bodyParser
  },
};

let retry = 0;
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (process.env.WHATSAPP_ENABLED === "false") return res.status(503).json({ result: false, curl_error: null, message: "Koneksi WhatsApp dinonaktifkan sementara." });
  // return res.status(200).json('ok');
  if (req.method !== "POST") {
    res.status(405).json({ result: false, curl_error: null, message: "Metode tidak diizinkan.", error: "Method not allowed" });
    return;
  }
  const parseData = await parseFormData(req);
  const { fields, files } = parseData;
  // const imageBuffer = (files.image !== undefined) ? readFileSync(files.image![0].filepath) : '';

  let file: any = undefined;
  if (Object.keys(files).length !== 0 || fields.hasOwnProperty("file")) {
    file = Object.keys(files).length !== 0 ? files.file![0] : fields.file![0];
  }
  retry = 0;
  const authInput = { api_key: fields.api_key?.[0], token_api: fields.token_api?.[0], device_id: fields.device_id?.[0] };
  const request = {
    caption: fields?.caption?.length ? fields.caption[0] : "",
    api_key: deviceToken(req, authInput) || authInput.token_api || "",
    number: fields?.number?.length ? fields.number[0] : "",
    phoneCountry: fields.phoneCountry?.length ? fields.phoneCountry[0] : "",
  };

  const validation = await SendAttachmentValidation(request);

  if (!validation?.result) {
    res.status(200).json({ result: false, curl_error: null, message: "Parameter pengiriman tidak valid." });
    return;
  }
  const { number, caption, phoneCode, api_key } = validation.data!;
  const tos = (number as string).split(",");

  let phone: Phone;
  try {
    for (const key of ["api_key", "token_api", "device_id"] as const) {
      if (new Set(fields[key] || []).size > 1) throw new DispatchAuthError(400, `${key} berulang harus memiliki nilai yang sama.`);
    }
    phone = (await resolveDispatchDevice(req, authInput)).phone;
  } catch (error) {
    if (!(error instanceof DispatchAuthError)) throw error;
    return res.status(error.invalidToken ? 200 : error.status).json({ result: false, curl_error: null, message: error.message });
  }
  if (phone.active !== 1) return res.status(409).json({ result: false, curl_error: null, message: "Perangkat nonaktif. Aktifkan sebelum mengirim." });
  await sendAttachment(
    {
      phoneId: phone.id,
      userId: phone.userId,
      tos,
      phoneCountry: phoneCode,
      caption: caption || "",
      file,
    },
    res
  );
}

const parseFormData = (
  req: NextApiRequest
): Promise<{
  fields: formidable.Fields;
  files: formidable.Files;
}> => {
  const form = new IncomingForm({ multiples: false });

  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);

      resolve({ fields, files });
    });
  });
};

const sendAttachment = async (
  req: {
    phoneId: string;
    userId: string;
    tos: string[];
    phoneCountry: string;
    caption: string;
    file: any;
  },
  res: NextApiResponse
) => {
  const { tos, caption, phoneId, userId, phoneCountry, file } = req;

  const url = process.env.NEXT_PUBLIC_APP_URL?.toString();

  try {
    const resSocket = await sendAttachmentMessageIo({
      userId,
      caption,
      phoneCountry,
      phoneId,
      tos,
      image: file,
    });

    res.status(200).json({ result: true, data: resSocket });
  } catch (err) {
    res.status(200).json({ result: false, curl_error: null, message: "Pengiriman gagal. Periksa status perangkat sebelum mencoba lagi." });
  }
};
