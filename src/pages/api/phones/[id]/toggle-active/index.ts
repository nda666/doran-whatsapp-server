import { prisma } from "@/lib/prisma";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { NextApiRequest, NextApiResponse } from "next";
import { getToken } from "next-auth/jwt";

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const token = await getToken({ req });
  const phoneId = req.query.id;
  const active = req.body.active;

  const result = await prisma.phone.updateMany({
    where: {
      id: String(phoneId),
      userId: String(token?.id),
    },
    data: {
      active: Number(active),
    },
  });

  return res.status(200).json(result);
};

export default apiAuthMiddleware(handler);
