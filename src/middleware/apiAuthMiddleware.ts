import { prisma } from "@/lib/prisma";
import { AuthNextApiRequest } from "@/types/global";
import { NextApiHandler, NextApiRequest, NextApiResponse } from "next";

// 7f76a027-bfa2-4921-82d0-1229a8532c65
export const apiAuthMiddleware =
  (handler: NextApiHandler) =>
  async (req: AuthNextApiRequest, res: NextApiResponse) => {
    const { authorization } = req.headers;

    if (!authorization || !authorization.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const token = authorization.split(" ")[1];

    try {
      const user = await prisma.user.findFirst({
        where: { token },
      });

      if (!user) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      req.user = user;
      return handler(req, res);
    } catch (error) {
      console.log(error);
      return res.status(401).json({ message: "Unauthorized" });
    }
  };

export default apiAuthMiddleware;
