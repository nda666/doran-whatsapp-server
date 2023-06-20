import { prisma } from "@/lib/prisma";
import { NextApiHandler, NextApiRequest, NextApiResponse } from "next";
import { getToken } from "next-auth/jwt";

// 7f76a027-bfa2-4921-82d0-1229a8532c65
export const guestMiddleware =
  (handler: NextApiHandler) =>
  async (req: NextApiRequest, res: NextApiResponse) => {
    const token = await getToken({ req });
    return handler(req, res);
  };

export default guestMiddleware;
