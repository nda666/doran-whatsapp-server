import type { NextApiHandler, NextApiRequest, NextApiResponse } from "next";

export const bearerAuthMiddleware =
  (handler: NextApiHandler) =>
  async (req: NextApiRequest, res: NextApiResponse) => {
    const authHeader = req.headers.authorization || req.headers["Authorization"];
    const authorization = Array.isArray(authHeader) ? authHeader[0] : authHeader;

    if (!authorization || !authorization.startsWith("Bearer ")) {
      return res.status(401).json({
        result: false,
        message: "Unauthorized: Missing or invalid Authorization Bearer header",
      });
    }

    const token = authorization.substring(7).trim();
    const expectedToken = process.env.API_TOKEN?.trim();

    if (!expectedToken || token !== expectedToken) {
      return res.status(401).json({
        result: false,
        message: "Unauthorized: Invalid API token",
      });
    }

    return handler(req, res);
  };

export default bearerAuthMiddleware;
