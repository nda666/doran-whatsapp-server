import type { NextApiRequest } from "next";

/** Whitelisted database sorting and bounded pagination; never interpolate SQL. */
export function tableQuery(query: NextApiRequest["query"], fields: string[] | Record<string, string>, fallback = "createdAt", defaultOrder: "asc" | "desc" = "desc") {
  const page = Math.max(1, Math.min(10000, Math.trunc(Number(query.page) || 1)));
  const limit = Math.max(1, Math.min(100, Math.trunc(Number(query.limit) || 5)));
  const allowed = Array.isArray(fields) ? Object.fromEntries(fields.map(field => [field, field])) : fields;
  const field = typeof query.sort === "string" && Object.prototype.hasOwnProperty.call(allowed, query.sort) ? allowed[query.sort] : fallback;
  const direction = query.order === "asc" || query.order === "desc" ? query.order : defaultOrder;
  const nested = field.split(".").reverse().reduce<any>((value, key) => ({ [key]: value }), direction);
  return { page, limit, skip: (page - 1) * limit, orderBy: field === "id" ? [nested] : [nested, { id: "asc" }] };
}
