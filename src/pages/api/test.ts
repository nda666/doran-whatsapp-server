import { NextApiRequest, NextApiResponse } from "next";

const mapx = new Map();

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  mapx.set(req.query.key, req.query.val);
  res.status(200).json(Object.fromEntries(mapx));
}
