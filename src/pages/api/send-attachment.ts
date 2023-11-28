import { prisma } from "@/lib/prisma";
import bcrypt from "bcrypt";
import { randomUUID } from "crypto";
import SignupForm, { SignupData } from "@/components/auth/SignupForm";
import { NextApiRequest, NextApiResponse } from "next";
import { SendMessageValidation } from "@/validations/sendMessage";
import formidable, {IncomingForm} from 'formidable';
import fs, { readFileSync } from "fs";
import { SendAttachmentValidation } from "@/validations/sendAttachment";
import { io } from "socket.io-client";
// import IncomingForm from "formidable/Formidable";

function readFile(
    req: NextApiRequest,
    saveLocally?: boolean
): Promise<{fields: formidable.Fields; files: formidable.Files}> {
    return new Promise((resolve,reject) => {
        return resolve
    })
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
    if(req.method !== 'POST') {
        res.status(405).json({"error": "Method not allowed"});
        return;
    }
    const parseData = await parseFormData(req);
    const {fields, files} = parseData;
    const {caption, api_key, sender, phoneCountry} = fields;
    // const imageBuffer = (files.image !== undefined) ? readFileSync(files.image![0].filepath) : '';

    let image: any = undefined; 
    if(Object.keys(files).length !== 0 || fields.hasOwnProperty('image')) {
        image = (Object.keys(files).length !== 0) ? files.image![0] : fields.image![0];
    }

    const request : {
        caption?: string;
        api_key?: string;
        sender?: string;
        phoneCountry?: string;
        image?: any 
    } = {
        caption: (caption![0].length !== 0) ? caption![0] : '',
        api_key: (api_key![0].length !== 0) ? api_key![0] : '',
        sender: (sender![0].length !== 0) ? sender![0] : '',
        phoneCountry: (sender![0].length !== 0) ? phoneCountry![0] : '',
        image: (image !== undefined) ? image : ''
    };
    
    retry = 0;
    const validation = await SendAttachmentValidation(request);

    if (!validation?.result) {
        res.status(200).json(validation?.error);
        return;
    }

    await sendAttachment(request,res);

}

const parseFormData = (
    req: NextApiRequest
) : 
Promise<{
    fields: formidable.Fields,
    files: formidable.Files
}> => {
    const form = new IncomingForm({multiples: false});

    return new Promise((resolve, reject) => {
        form.parse(req,(err, fields, files) => {
            if(err) reject(err)

            resolve({fields, files});
        })
    })
}

const sendAttachment = async (req:{
    caption?: string;
    api_key?: string;
    sender?: string;
    phoneCountry?: string;
    image?: any
}, res: NextApiResponse) => {
    const { sender, caption, api_key, phoneCountry, image } = req;
    const tos = (sender as string).split(",");
  
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
        .emitWithAck("sendAttachment", {
          phoneId: phone.id,
          userId: phone.userId,
          tos,
          phoneCountry,
          caption,
          image,
        });
      res.status(200).json({ result: true, data: resSocket });
    } catch (err) {
      res.status(200).json({ result: false, data: err });
    }
}