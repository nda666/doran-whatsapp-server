import type { NextApiRequest } from "next";

// Bearer takes precedence, then body/form-data, then the query parameter.
export function deviceToken(req: Pick<NextApiRequest, "headers" | "query">, input?: any): string | undefined {
  const authorization = req.headers.authorization;
  const bearer = typeof authorization === "string" ? /^Bearer\s+(.+)$/i.exec(authorization)?.[1] : undefined;
  const value = bearer ?? input?.api_key ?? req.query?.api_key;
  return typeof value === "string" && value.trim() && value.trim().length <= 256 ? value.trim() : undefined;
}
