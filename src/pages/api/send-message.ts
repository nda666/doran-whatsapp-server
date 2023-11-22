import base64toImage from "@/lib/base64toImage";
import makeWASocket, { deleteSession } from "@/lib/makeWASocket";
import { prisma } from "@/lib/prisma";
import { AuthNextApiRequest } from "@/types/global";
import { SendMessageValidation } from "@/validations/sendMessage";
import { delay } from "@whiskeysockets/baileys";
import axios from "axios";
import formidable from "formidable";
import { readFile } from "fs";
import { CountryCode, parsePhoneNumber } from "libphonenumber-js";
import { NextApiRequest, NextApiResponse } from "next";
import { NextRequest } from "next/server";
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

const isBase64 = (str: string) => {
  try {
    const decodeString = atob(str);

    const encodedString = btoa(decodeString);

    return encodedString === str;
  }
  catch (e) {
    return false
  }
}

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


  const url = process.env.APP_URL?.toString();

  const socketIo = io(url!, {
    path: "/socket.io",
    autoConnect: true,
    timeout: 10000
  });
  
  socketIo.on("connect", () => {
    console.log("socket connected");

     // Now that the connection is established, emit the event
    socketIo.emit("sendTextMessage", {
      phoneId: phone.id,
      userId: phone.userId,
      tos,
      phoneCountry,
      message,
      image
    });
    res.status(200).json({ success: true });
    socketIo.close();
  });

  // Handle connection errors
  socketIo.on("connect_error", (err) => {
    console.error("Socket connection error:", err);
    res.status(400).json({ message: "Gagal koneksi ke IO" });
  });

  // Handle connection timeout
  socketIo.on("connect_timeout", () => {
    console.error("Socket connection timeout");
    res.status(400).json({ message: "Gagal koneksi ke IO" });
  });

  // previous
  // const socket = await makeWASocket(phone.userId, phone.id);
  // res.status(200).json({ result: true, req: tos, phone: phone, wasocket: socket });
  // return;

  // try {
  //   // let send: any = [];
    
  //   // for (const _to of tos) {
  //   //   const parsedTo = parsePhoneNumber(
  //   //     _to,
  //   //     (phoneCountry || "ID") as CountryCode
  //   //   );
  //   //   const sendResult = await socket.sendMessage(
  //   //     `${parsedTo.countryCallingCode}${parsedTo.nationalNumber}@s.whatsapp.net`,
  //   //     {
  //   //       text: message!,
  //   //     }
  //   //   );
  //   //   send.push(sendResult);
  //   // }
  //   // res.status(200).json({ result: true, data: send });
  //   // return;

  //   let send: any = [];
  //   if(!image) {
  //     for (const _to of tos) {
  //       const parsedTo = parsePhoneNumber(
  //         _to,
  //         (phoneCountry || "ID") as CountryCode
  //       );
  //       const sendResult = await socket.sendMessage(
  //         `${parsedTo.countryCallingCode}${parsedTo.nationalNumber}@s.whatsapp.net`,
  //         {
  //           text: message!,
  //         }
  //       );
  //       send.push(sendResult);
  //     }
  //     res.status(200).json({ result: true, data: send });
  //     return;
  //   } else {
  //     // return res.status(200).json({'image-type': typeof imageType});
  //     const imgExt = ['jpg','jpeg','png','gif'];
  //     if(isBase64(image)) {
  //       // return res.status(200).json('ok file');
  //       let fileName = new Date().getTime() + '_' + phone.id + '.'+'png';
  //       const binaryString = Buffer.from(image);
  //       // const blob = new Blob([binaryString], {type: 'image/png' || 'image/png'});

  //       // const file = new File([blob], fileName || 'image', {type: 'image/png' || 'image/png'});
  //       // return res.status(200).json({'binary': binaryString});
  //       for (const _to of tos) {
  //       const parsedTo = parsePhoneNumber(
  //         _to,
  //         (phoneCountry || "ID") as CountryCode
  //       );
  //       const sendResult = await socket.sendMessage(
  //         `${parsedTo.countryCallingCode}${parsedTo.nationalNumber}@s.whatsapp.net`,
  //         {
  //           image: binaryString,
  //         }
  //       );
  //       send.push(sendResult);
  //       }
  //       res.status(200).json({ result: true, data: send });
  //       return;

  //       // const blob = new Blob([binaryString], {type: 'image/png' || 'image/png'});

  //       // const file = new File([blob], fileName || 'image', {type: 'image/png' || 'image/png'});
  //       // return res.status(200).json({'file': binaryString});
  //       // const imgFile = await base64toImage(image, fileName, 'image/png');
        
  //       // let image_extension = imgFile!.name.split(".").pop();

  //       // if(imgExt.includes(image_extension!)) {
  //       //   // const formdata = new FormData();
  //       //   // formdata.append("image",image);
  //       //   // const response = await axios.post(`/api/image?phone_id=${phone.id}`,formdata);
  //       //   const bytes = await imgFile.arrayBuffer();
  //       //   const buffer = Buffer.from(bytes);
  //       //   for (const _to of tos) {
  //       //     const parsedTo = parsePhoneNumber(
  //       //       _to,
  //       //       (phoneCountry || "ID") as CountryCode
  //       //     );
  //       //     const sendResult = await socket.sendMessage(
  //       //       `${parsedTo.countryCallingCode}${parsedTo.nationalNumber}@s.whatsapp.net`,
  //       //       {
  //       //         image: buffer!,
  //       //       }
  //       //     );
  //       //     send.push(sendResult);
  //       //   }
  //       //   res.status(200).json({ result: true, data: send });
  //       //   return;
  //     }
  //     else if(image !== null && !isBase64(image)) {
  //       // return res.status(200).json('ok');
  //       for (const _to of tos) {
  //         const parsedTo = parsePhoneNumber(
  //           _to,
  //           (phoneCountry || "ID") as CountryCode
  //         );
  //         const sendResult = await socket.sendMessage(
  //           `${parsedTo.countryCallingCode}${parsedTo.nationalNumber}@s.whatsapp.net`,
  //           {
  //             image: {
  //               url: image
  //             },
  //           }
  //         );
  //         send.push(sendResult);
  //       }
  //       res.status(200).json({ result: true, data: send });
  //       return;
  //     }
  //   }
    
  // } catch (e: any) {
  //   if (e?.output?.statusCode === 428 && retry < 5) {
  //     deleteSession(phone.id);
  //     retry++;
  //     await delay(2000);
  //     await sendMessage(req, res);
  //     return;
  //   }
  //   res.status(500).json({ result: false, error: e });
  //   return;
  // }
};


// const handler = async (req: NextApiRequest, res: NextApiResponse) => {
//   return res.status(200).json("ok");
// }

export default handler;
