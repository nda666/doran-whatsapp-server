// import makeWASocket, { deleteSession } from "@/lib/makeWASocket";

import { getAllSession } from "@/lib/makeWASocket";
import { prisma } from "@/lib/prisma";
import { AuthNextApiRequest } from "@/types/global";
import { SendMessageValidation } from "@/validations/sendMessage";
import {  NextApiRequest, NextApiResponse } from "next";
import formidable, {IncomingForm} from "formidable";
import { io } from "socket.io-client";

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

export const config = {
  api: {
    bodyParser: false,
  },
};

const parseFormData = (req: NextApiRequest): Promise<{fields: formidable.Fields, files: formidable.Files}> => {
  const form = new IncomingForm({multiples: false})
   return new Promise((resolve,reject) => {
     form.parse(req, (err,fields, files) => {
       if(err) reject(err)
       resolve({fields, files})
     })
   })
 }

const handler = async (req: SendMessageRequest, res: NextApiResponse) => {
  const contentType = req.headers['content-type'];
  if (req.method !== "POST") {
    res.status(405).send("");
    return;
  }

  const parseData = await parseFormData(req);
  const inputFields = parseData.fields;

  let bodyInput: { 
    number?: string;
    message?: string;
    api_key?: string;
    phoneCountry?: string;
    image: any;
  } = {
    number: undefined,
    message: undefined,
    api_key: undefined,
    phoneCountry: undefined,
    image: undefined
  };

  let image: any = undefined; 
  if(Object.keys(parseData.files).length !== 0 || inputFields.hasOwnProperty('image')) {
    image = (Object.keys(parseData.files).length !== 0) ? parseData.files.image![0] : inputFields.image![0];
  }
  
  req.body = {
    number: inputFields.number![0],
    api_key: inputFields.api_key![0],
    message: inputFields.message![0],
    phoneCountry: inputFields.phoneCountry![0],
    image:  image
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
  const { number, message, api_key, phoneCountry, image } = req.body;
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

  const url = process.env.NEXT_PUBLIC_APP_URL?.toString();

  const socketIo = io(url!, {
    path: "/socket.io",
    autoConnect: true,
    timeout: 10000,
    transports: ["websocket"],
  });
  try {
    const resSocket = await socketIo
      .timeout(10000)
      .emitWithAck("sendTextMessage", {
        phoneId: phone.id,
        userId: phone.userId,
        tos,
        phoneCountry,
        message,
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
