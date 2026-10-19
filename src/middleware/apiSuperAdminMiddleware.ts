import type { NextApiHandler } from "next";
import type { AuthNextApiRequest } from "../types/global";
import { isSuperAdmin } from "../lib/access";
import apiAuthMiddleware from "./apiAuthMiddleware";

/** Always checks the current account in the database, including bearer requests. */
export default function apiSuperAdminMiddleware(handler: NextApiHandler) {
  return apiAuthMiddleware((req: AuthNextApiRequest, res) => {
    res.setHeader("Cache-Control", "no-store");
    if (!isSuperAdmin(req.user!)) {
      return res.status(403).json({ message: "Akses hanya untuk super admin." });
    }
    return handler(req, res);
  });
}
