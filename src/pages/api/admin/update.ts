import type { NextApiResponse } from "next";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
import apiSuperAdminMiddleware from "@/middleware/apiSuperAdminMiddleware";
import { AuthNextApiRequest } from "@/types/global";
import packageInfo from "../../../../package.json";
async function handler(req: AuthNextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).end();
  const applied = await prisma.$queryRaw<Array<{ migration_name: string }>>`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`;
  const folders = await fs.readdir(path.join(process.cwd(), "prisma", "migrations"), { withFileTypes: true });
  return res.json({ version: packageInfo.version, node: process.version, pendingMigrations: folders.filter(f => f.isDirectory() && !applied.some(m => m.migration_name === f.name)).map(f => f.name) });
}
export default apiSuperAdminMiddleware(handler);
