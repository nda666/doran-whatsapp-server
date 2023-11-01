import { prisma } from "@/lib/prisma";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
// import Nextauth from "../auth/[...nextauth]";
import { getToken } from "next-auth/jwt";
import { AuthNextApiRequest } from "@/types/global";
import { InboxMessage } from "@prisma/client";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  switch (req.method) {
    case "GET":
      return GET(req, res);
    case "POST":
      return POST(req, res);
    default:
      res.status(405).end();
  }
}

const GET = async (req: NextApiRequest, res: NextApiResponse) => {
  const token = await getToken({ req });
  res.status(200).json('wow');
  try {
    const autoreply = await prisma.inboxMessage.findMany({
      where: {
        sender: req.body.sender_number
      },
    });
    res.status(200).json(autoreply);
  } catch (err) {
    res.status(500).end();
  }
};

const POST = async (req: NextApiRequest, res: NextApiResponse) => {
    // res.status(200).json('wow');
    try {
        // let inbox_messages: any = await prisma.inboxMessage.create({
        //     data: {
        //         message: req.body.message,
        //         recipient: req.body.recipient, 
        //         sender: req.body.number,
        //         // isRead: true
        //     }
        // })
        const {message, recipient, sender} = req.body;
        let createInbox = await prisma.inboxMessage.create({
            data: {
                message: message,
                sender: sender,
                recipient: recipient 
            }
        });

        res.status(200).json({
            message: `create user ${recipient}`
        });

        throw new Error('there has fault')
    }catch(err:any){
        res.status(400).json({
            msg: err.message
        });
    }
//   return res.status(200).json(inbox_messages);
};
