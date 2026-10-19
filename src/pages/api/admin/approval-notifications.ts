import type { NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import apiSuperAdminMiddleware from "@/middleware/apiSuperAdminMiddleware";
import { AuthNextApiRequest } from "@/types/global";

async function handler(req: AuthNextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).end();
  const pendingCount = await prisma.user.count({ where: { approvalStatus: "PENDING" } });
  return res.json({ pendingCount });
}

export default apiSuperAdminMiddleware(handler);
