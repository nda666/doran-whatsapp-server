import { tableQuery } from "@/lib/tableQuery";
import { inboxScope as ownerScope } from "@/lib/access";
import type { NextApiResponse } from "next";
import { prisma } from "@/lib/prisma";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { AuthNextApiRequest } from "@/types/global";
import { dispatchDateFilter } from "@/lib/dispatchDateFilter";
async function handler(req: AuthNextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).end();
  res.setHeader("Cache-Control", "no-store");
  let dateFilter: ReturnType<typeof dispatchDateFilter>;
  try { dateFilter = dispatchDateFilter(req.query.start_date, req.query.end_date); }
  catch (error) { return res.status(400).json({ message: (error as Error).message }); }
  const { page, limit, skip, orderBy } = tableQuery(req.query, ["sender", "recipient", "message", "quote", "respons", "image_in", "type_request", "url", "sentAt", "receivedAt"], "id", "desc");
  const where = { ...ownerScope(req.user!),
    ...(dateFilter.gte ? { receivedAt: dateFilter } : {}),
    ...(typeof req.query.sender === "string" && req.query.sender ? { sender: { contains: req.query.sender.slice(0, 100) } } : {}),
    ...(typeof req.query.recipient === "string" && req.query.recipient ? { recipient: { contains: req.query.recipient.slice(0, 100) } } : {}) };
  const [data, totalData] = await Promise.all([prisma.inboxMessage.findMany({ where, take: limit, skip, orderBy }), prisma.inboxMessage.count({ where })]);
  return res.json({ data, totalData, totalPage: Math.ceil(totalData / limit), currentPage: page });
}
export default apiAuthMiddleware(handler);
