import { ownerScope } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { AuthNextApiRequest } from "@/types/global";
import type { NextApiResponse } from "next";
async function handler(req: AuthNextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") return res.status(200).json(await prisma.inboxMessage.findMany({
    where: { ...ownerScope(req.user!), ...(typeof req.query.sender_number === "string" ? { sender: req.query.sender_number } : {}) },
    orderBy: { id: "desc" }, take: 100,
  }));
  if (req.method !== "POST") return res.status(405).end();
  const { message, recipient, sender } = req.body || {};
  if (typeof message !== "string" || typeof recipient !== "string" || typeof sender !== "string") return res.status(400).json({ message: "Invalid message" });
  const created = await prisma.inboxMessage.create({ data: { userId: req.user!.id, message, recipient, sender } });
  return res.status(201).json({ id: created.id });
}
export default apiAuthMiddleware(handler);
