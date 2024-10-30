import formidable, { IncomingForm } from "formidable";
import { NextApiRequest, NextApiResponse } from "next";

import { prisma } from "@/lib/prisma";
import sendAttachmentMessageIo from "@/server/libs/sendAttachmentMessageIo";
import { SendAttachmentValidation } from "@/validations/sendAttachment";

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
  // return res.status(200).json('ok');
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
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
  const request = {
    caption: fields?.caption?.length ? fields.caption[0] : "",
    api_key: fields?.api_key?.length ? fields.api_key[0] : "",
    number: fields?.number?.length ? fields.number[0] : "",
    phoneCountry: fields.phoneCountry?.length ? fields.phoneCountry[0] : "",
  };

  const validation = await SendAttachmentValidation(request);

  if (!validation?.result) {
    res.status(200).json(validation?.error);
    return;
  }
  const { number, caption, phoneCode, api_key } = validation.data!;
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
    res.status(200).json({ result: false, data: err });
  }
};
