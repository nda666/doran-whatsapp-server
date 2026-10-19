import type { ParsedUrlQuery } from "querystring";
import type { TableState } from "./useTableState";
import { phonePolicySortFields } from "./phonePolicySort";

export type PhoneSearchState = {
  filters: { name: string; number: string; is_online: string; active: string };
  table: TableState;
  showSearch: boolean;
};

const sortFields = ["name", "number", "account_name", "token", "isOnline", "is_save_group", "active", "createdAt", "lastQrScanAt", "user.name", ...phonePolicySortFields];

export function readPhoneSearchState(query: ParsedUrlQuery): PhoneSearchState {
  const text = (key: string) => typeof query[key] === "string" ? query[key] as string : "";
  const status = (key: string) => ["0", "1"].includes(text(key)) ? text(key) : "";
  const page = Number(text("page"));
  const limit = Number(text("limit"));
  const sort = sortFields.includes(text("sort")) ? text("sort") : "";
  const order = ["asc", "desc"].includes(text("order")) ? text("order") : "";
  return {
    filters: { name: text("name"), number: text("number"), is_online: status("is_online"), active: status("active") },
    table: {
      page: Number.isSafeInteger(page) && page > 0 ? page : 1,
      limit: [5, 10, 20, 50, 100].includes(limit) ? limit : 5,
      sort: order ? sort : "",
      order: sort ? order : "",
    },
    showSearch: text("search") !== "hidden",
  };
}

export function phoneSearchQuery(state: PhoneSearchState): Record<string, string> {
  const query = Object.fromEntries(Object.entries(state.filters).filter(([, value]) => value));
  if (state.table.page !== 1) query.page = String(state.table.page);
  if (state.table.limit !== 5) query.limit = String(state.table.limit);
  if (state.table.sort && state.table.order) {
    query.sort = state.table.sort;
    query.order = state.table.order;
  }
  if (!state.showSearch) query.search = "hidden";
  return query;
}
