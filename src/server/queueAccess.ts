import type { RequestHandler } from "express";
import type { NextApiResponse } from "next";
import type { AuthNextApiRequest } from "../types/global";
import apiSuperAdminMiddleware from "../middleware/apiSuperAdminMiddleware";

// The queue console can delete/retry jobs for every account.
export const queueAccess: RequestHandler = (req, res, next) => {
  const authorize = apiSuperAdminMiddleware(() => next());
  void authorize(req as unknown as AuthNextApiRequest, res as unknown as NextApiResponse);
};
