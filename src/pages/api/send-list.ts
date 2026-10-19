import type { NextApiRequest, NextApiResponse } from "next";
import handler from "./public/[action]";

export default function alias(req: NextApiRequest, res: NextApiResponse) {
  req.query = { ...req.query, action: "send-list" };
  return handler(req, res);
}
