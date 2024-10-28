import type { NextApiRequest, NextApiResponse } from "next";
import { getToken } from "next-auth/jwt";

import { prisma } from "@/lib/prisma";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
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

  try {
    const { number, name, is_online } = req.query;
    // if (status && !isPhoneStatus(status)) {
    //   res.status(400).json({ message: "status_is_invalid" });
    //   return;
    // }
    const phones = await prisma.phone.findMany({
      where: {
        userId: req?.user?.id!,
        ...(number && {
          number: {
            contains: String(number), // Case-insensitive search, adjust if needed
          },
        }),
        ...(name && {
          name: {
            contains: String(name), // Case-insensitive search, adjust if needed
          },
        }),
        ...(typeof is_online !== "undefined" && {
          isOnline: is_online == "1" ? true : false,
        }),
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
        is_save_group: req.body.is_save_group,
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
