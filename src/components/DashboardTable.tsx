import { useUiTranslation } from "@/lib/uiTranslation";
import { Select, Space, Table, Typography } from "antd";
import type { TableProps } from "antd";
import { useId, useState } from "react";
import type { DashboardTableState } from "@/lib/useTableState";
import TableSortIndicator from "./TableSortIndicator";
import type { SortOrder } from "antd/es/table/interface";

type Props<T> = TableProps<T> & { table?: DashboardTableState; total?: number };
export default function DashboardTable<T extends object>({ table, total, columns, pagination, onChange, ...props }: Props<T>) {
  const uiText = useUiTranslation();
  const [localSize, setLocalSize] = useState(5);
  const [localPage, setLocalPage] = useState(1);
  const labelId = useId();
  const size = table?.limit || localSize;
  const sortable = columns?.map(column => {
    if ("children" in column) return column;
    const field = Array.isArray(column.dataIndex) ? column.dataIndex.join(".") : String(column.dataIndex || "");
    if (!field || column.key === "action" || column.key === "aksi") return column;
    const read = (row: any) => field.split(".").reduce((value, key) => value?.[key], row);
    return { ...column, key: field, sorter: table ? true : (a: T, b: T) => {
      const first = read(a), second = read(b);
      if (typeof first === "number" || typeof first === "boolean") return Number(first || 0) - Number(second || 0);
      return String(first ?? "").localeCompare(String(second ?? ""), "id", { numeric: true, sensitivity: "base" });
    }, ...(table ? { sortOrder: table.sort === field ? table.order === "asc" ? "ascend" as const : "descend" as const : null } : {}) };
  }).map(column => "children" in column || !column.sorter ? column : {
    ...column,
    sortIcon: ({ sortOrder }: { sortOrder: SortOrder }) => <TableSortIndicator sortOrder={sortOrder} />,
  });
  return <Table<T> {...props} columns={sortable} showSorterTooltip={false}
    title={() => <div className="dashboard-table-toolbar"><Space wrap><Typography.Text id={labelId}>{uiText("Tampilkan")}</Typography.Text><Select aria-labelledby={labelId} value={size} options={[5, 10, 20, 50, 100].map(value => ({ value, label: value }))} style={{ width: 80 }} onChange={value => { if (table) table.resize(value); else { setLocalSize(value); setLocalPage(1); } }} /><Typography.Text>{uiText("data per halaman")}</Typography.Text></Space></div>}
    pagination={{ ...(typeof pagination === "object" ? pagination : {}), current: table?.page || localPage, pageSize: size, ...(table ? { total: total || 0 } : {}), showSizeChanger: false, showTotal: count => uiText("Jumlah data: {{v0}}", { v0: count.toLocaleString(uiText.locale) }) }}
    onChange={(page, filters, sorter, extra) => { if (table) table.change(page, sorter); else setLocalPage(page.current || 1); onChange?.(page, filters, sorter, extra); }} />;
}
