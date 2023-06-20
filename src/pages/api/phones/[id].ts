import { prisma } from "@/lib/prisma";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { NextApiRequest, NextApiResponse } from "next";
import { getToken } from "next-auth/jwt";

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const token = await getToken({ req });
  const phoneId = req.query.id;
  switch (req.method) {
    case "DELETE":
      deletePhone(token?.id!, phoneId?.toString()!, res);
      break;
    default:
      res.status(405).end();
  }
};

async function deletePhone(
  userId: string,
  phoneId: string,
  res: NextApiResponse
) {
  const result =
    (
      await prisma.phone.deleteMany({
        where: {
          id: phoneId,
          userId,
        },
      })
    ).count >= 0;
  res.status(200).json({ result });
}

export default apiAuthMiddleware(handler);
