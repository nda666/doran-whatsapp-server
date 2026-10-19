import { useState } from "react";
import type { TablePaginationConfig } from "antd";
import type { SorterResult } from "antd/es/table/interface";

export type TableState = { page: number; limit: number; sort: string; order: string };

export function useTableState(controlled?: { value: TableState; onChange: (value: TableState) => void }) {
  const [state, setState] = useState({ page: 1, limit: 5, sort: "", order: "" });
  const current = controlled?.value ?? state;
  const update = (change: (previous: TableState) => TableState) => {
    if (controlled) controlled.onChange(change(current));
    else setState(change);
  };
  return {
    ...current,
    params: new URLSearchParams(Object.fromEntries(Object.entries(current).map(([key, value]) => [key, String(value)]))).toString(),
    reset: () => update(previous => ({ ...previous, page: 1 })),
    resize: (limit: number) => update(previous => ({ ...previous, limit, page: 1 })),
    change: (pagination: TablePaginationConfig, sorter: SorterResult<any> | SorterResult<any>[]) => {
      const selected = Array.isArray(sorter) ? sorter[0] : sorter;
      const sort = selected?.order ? String(selected.columnKey || "") : "";
      const order = selected?.order === "ascend" ? "asc" : selected?.order === "descend" ? "desc" : "";
      update(previous => ({ ...previous, page: sort !== previous.sort || order !== previous.order ? 1 : pagination.current || 1, sort, order }));
    },
  };
}
export type DashboardTableState = ReturnType<typeof useTableState>;
