import type { NextApiResponse } from "next";
import apiAuthMiddleware from "@/middleware/apiAuthMiddleware";
import { AuthNextApiRequest } from "@/types/global";
import { phoneRecordScope as ownerScope } from "@/lib/access";
import { summarize } from "@/server/messaging/analytics";
export default apiAuthMiddleware(async (req: AuthNextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") return res.status(405).end();
  res.setHeader("Cache-Control", "no-store");
  const now = Date.now(), offset = 7 * 3600000;
  const dayStart = Math.floor((now + offset) / 86400000) * 86400000 - offset;
  const weekDay = new Date(dayStart + offset).getUTCDay();
  const weekStart = dayStart - ((weekDay + 6) % 7) * 86400000;
  const start = req.query.period === "week" ? weekStart : dayStart;
  const previousStart = start - (req.query.period === "week" ? 7 : 1) * 86400000;
  const scope = ownerScope(req.user!);
  const [current, previous] = await Promise.all([
    summarize({ ...scope, createdAt: { gte: new Date(start), lt: new Date(now) } }),
    summarize({ ...scope, createdAt: { gte: new Date(previousStart), lt: new Date(previousStart + now - start) } }),
  ]);
  return res.json({ current, previous, currentStart: new Date(start), previousStart: new Date(previousStart), asOf: new Date(now), timezone: "Asia/Jakarta" });
});
