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

  const socketIo = io(url!, {
    path: "/socket.io",
    autoConnect: true,
    timeout: 10000,
  });

  try {
    const resSocket = await socketIo
      .timeout(10000)
      .emitWithAck("sendGroupMessage", {
        phoneId: phone.id,
        userId: phone.userId,
        // tos,
        phoneCountry,
        message,
        image,
      });

    res.status(200).json({ result: true, data: resSocket });
  } catch (err) {
    res.status(200).json({ result: false, data: err });
  }

  // socketIo.on("connect", () => {
  //   // Now that the connection is established, emit the event
  //   socketIo.emit("sendGroupMessage", {
  //     phoneId: phone.id,
  //     userId: phone.userId,
  //     // tos,
  //     phoneCountry,
  //     message,
  //     image,
  //     id_group,
  //   });
  //   res.status(200).json({ success: true });

  // });

  // // Handle connection errors
  // socketIo.on("connect_error", (err) => {
  //   res.status(400).json({ message: "Gagal koneksi ke IO" });
  // });

  // // Handle connection timeout
  // socketIo.on("connect_timeout", () => {
  //   res.status(400).json({ message: "Gagal koneksi ke IO" });
  // });
};

// const handler = async (req: NextApiRequest, res: NextApiResponse) => {
//   return res.status(200).json("ok");
// }

export default handler;
