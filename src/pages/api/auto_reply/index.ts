import { prisma } from "@/lib/prisma";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import Nextauth from "../auth/[...nextauth]";
import { getToken } from "next-auth/jwt";
import { AuthNextApiRequest } from "@/types/global";

async function handler(req: NextApiRequest, res: NextApiResponse) {
  switch (req.method) {
    case "GET":
      return GET(req, res);
    case "POST":
      return POST(req, res);
    default:
      res.status(405).end();
  }
}

const GET = async (req: AuthNextApiRequest, res: NextApiResponse) => {
  const token = await getToken({ req });
  // return res.status(200).json({'text': 'ok'});
  // res.status(200).json({'text': req.query.phone_id,'text1': 'ok'});
  try {
    const autoreply = await prisma.autoReply.findMany({
      where: {
        userId: req?.user?.id!,
        phoneId: String(req?.query.phone_id),
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    res.status(200).json(autoreply);
  } catch (err) {
    res.status(500).end();
  }
};

const POST = async (req: AuthNextApiRequest, res: NextApiResponse) => {
  let auto_replies: any = undefined;
//   if (req.body.phoneId) {
//     phones = await prisma.autoReply.update({
//       where: {
//         id: req.body.phoneId,
//       },
//       data: {
//         name: req.body.name,
//       },
//     });
//   } else {
//     phones = await prisma.phone.create({
//       data: {
//         userId: req.user?.id!,
//         name: req.body.name,
//       },
//     });
//   }
  if(req.body.id) {
    auto_replies =await prisma.autoReply.update({
      where: {
        id: req.body.id
      },
      data: {
        type_keyword: req.body.type_keyword,
        keyword: req.body.keyword,
        reply: {'text': req.body.reply}
      }
    })
  } 
  else {
    auto_replies = await prisma.autoReply.create({
      data: {
          userId: req.user?.id!,
          phoneId: req.body.phoneId,
          type_keyword: req.body.type_keyword,
          keyword: req.body.keyword,
          reply: {'text': req.body.reply}
      }
    })
  }
  return res.status(200).json(auto_replies);
};

export default apiAuthMiddleware(handler);
