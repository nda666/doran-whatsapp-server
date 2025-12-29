// import makeWASocket, { deleteSession } from "@/lib/makeWASocket";

import { NextApiResponse } from "next";

import { AuthNextApiRequest } from "@/types/global";

import sendWaQueue from "../../../lib/queues/sendWaQueue";

let retry = 0;
interface SendMessageRequest extends AuthNextApiRequest {}

const handler = async (req: SendMessageRequest, res: NextApiResponse) => {
  if (req.method !== "POST") {
    res.status(405).send("");
    return;
  }
  sendWaQueue.add({ Test: "YYYYYYYYYYYYYYYYYYYYYYYYYYoooooooooooooooooo" });
  res.status(200).json({
    result: true,
    message: "YYYYYYYYYYYYYYYYYYYYYYYYYYoooooooooooooooooo",
  });
};
export default handler;
