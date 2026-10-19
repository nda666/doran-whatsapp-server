import { NextApiRequest, NextApiResponse } from "next";
import apiSuperAdminMiddleware from "@/middleware/apiSuperAdminMiddleware";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") return res.status(405).end();
  res.status(200).json("Oke");
}
export default apiSuperAdminMiddleware(handler);
