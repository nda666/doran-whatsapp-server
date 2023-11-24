// import makeWASocket, { deleteSession } from "@/lib/makeWASocket";

import { prisma } from "@/lib/prisma";
import { AuthNextApiRequest } from "@/types/global";
import { SendMessageValidation } from "@/validations/sendMessage";
import { NextApiResponse } from "next";
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
    transports:
      process.env.NODE_ENV == "development" ? ["polling"] : ["websocket"],
  });

  socketIo.on("connect", () => {
    // Now that the connection is established, emit the event
    socketIo.emit("sendTextMessage", {
      phoneId: phone.id,
      userId: phone.userId,
      tos,
      phoneCountry,
      message,
      image,
    });
    res.status(200).json({ result: true });
    socketIo.close();
  });

  // Handle connection errors
  socketIo.on("connect_error", (err) => {
    res
      .status(400)
      .json({ result: false, message: "Gagal koneksi ke IO", error: err });
  });

  // Handle connection timeout
  socketIo.on("connect_timeout", () => {
    res
      .status(400)
      .json({ result: false, message: "Gagal koneksi ke IO: TIMEOUT" });
  });
};

// const handler = async (req: NextApiRequest, res: NextApiResponse) => {
//   return res.status(200).json("ok");
// }

export default handler;
