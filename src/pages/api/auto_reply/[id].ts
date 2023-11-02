import { prisma } from "@/lib/prisma";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { NextApiRequest, NextApiResponse } from "next";
import { getToken } from "next-auth/jwt";

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const token = await getToken({ req });
  const replyId = req.query.id;
  const phoneId = req.query.phone_id;
  switch (req.method) {
    case "DELETE":
      deletePhone(token?.id!, Number(replyId),phoneId?.toString()!, res);
      break;
    default:
      res.status(405).end();
  }
};

async function deletePhone(
  userId: string,
  replyId: number,
  phoneId: string,
  res: NextApiResponse
) {
  const result =
    (
      await prisma.autoReply.deleteMany({
        where: {
          id: replyId,
          phoneId: phoneId,
        },
      })
    ).count >= 0;
  res.status(200).json({ result });
}

export default apiAuthMiddleware(handler);
