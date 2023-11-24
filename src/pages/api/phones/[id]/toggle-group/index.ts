import { prisma } from "@/lib/prisma";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { NextApiRequest, NextApiResponse } from "next";
import { getToken } from "next-auth/jwt";

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const token = await getToken({ req });
  const phoneId = req.query.id;
  const is_save_group = req.body.is_save_group;
  // return res.status(200).json({ok: 'ok', phoneId: phoneId});
  //
  const result = await prisma.phone.updateMany({
    where: {
      id: String(phoneId),
      userId: String(token?.id),
    },
    data: {
      is_save_group: is_save_group,
    },
  });

  return res.status(200).json(result);
};

export default apiAuthMiddleware(handler);
