import type { NextApiResponse } from "next";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import apiSuperAdminMiddleware from "@/middleware/apiSuperAdminMiddleware";
import type { AuthNextApiRequest } from "@/types/global";
import { readPm2Information } from "@/server/pm2Information";

export default apiSuperAdminMiddleware(async (req: AuthNextApiRequest, res: NextApiResponse) => {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).end(); }
  const packages = ["next", "react", "antd", "axios", "express", "@prisma/client", "bull", "bullmq", "socket.io", "next-i18next", "dayjs", "typescript"];
  const versions: Record<string, string> = {};
  for (const name of packages) {
    try { versions[name] = JSON.parse(fs.readFileSync(path.join(process.cwd(), "node_modules", name, "package.json"), "utf8")).version; }
    catch { versions[name] = "Tidak tersedia"; }
  }
  let database: { version: string; comment: string } | undefined;
  try {
    const rows = await prisma.$queryRaw<{ version: string; comment: string }[]>`SELECT VERSION() AS version, @@version_comment AS comment`;
    database = rows[0];
  } catch { /* Return no connection details or database errors. */ }
  return res.json({ checkedAt: new Date().toISOString(), node: process.version, versions, database, pm2: await readPm2Information(),
    dispatchEnabled: process.env.DISPATCH_QUEUE_ENABLED === "true",
    redisQueueEnabled: process.env.QUEUE_ENABLED !== "false",
    concurrency: Math.min(16, Math.max(1, Number(process.env.DISPATCH_CONCURRENCY) || 4)),
    intervalMs: Math.max(500, Number(process.env.DISPATCH_INTERVAL_MS) || 1000) });
});
