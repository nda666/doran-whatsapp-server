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
  console.log("token", req);
  try {
    const phones = await prisma.phone.findMany({
      where: {
        userId: req?.user?.id!,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    res.status(200).json(phones);
  } catch (err) {
    res.status(500).end();
  }
};

const POST = async (req: AuthNextApiRequest, res: NextApiResponse) => {
  let phones: any = undefined;
  if (req.body.id) {
    phones = await prisma.phone.update({
      where: {
        id: req.body.id,
      },
      data: {
        name: req.body.name,
      },
    });
  } else {
    phones = await prisma.phone.create({
      data: {
        userId: req.user?.id!,
        name: req.body.name,
      },
    });
  }
  return res.status(200).json(phones);
};

export default apiAuthMiddleware(handler);
