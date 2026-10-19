import type { SortOrder } from "antd/es/table/interface";

export default function TableSortIndicator({ sortOrder }: { sortOrder: SortOrder }) {
  const active = !!sortOrder;
  return <span className={`table-sort-indicator${active ? " is-active" : ""}`} aria-hidden="true">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {sortOrder === "ascend" ? <path d="M12 19V5m-5 5 5-5 5 5" />
        : sortOrder === "descend" ? <path d="M12 5v14m-5-5 5 5 5-5" />
        : <><path d="M8 19V5m-4 4 4-4 4 4" /><path d="M16 5v14m-4-4 4 4 4-4" /></>}
    </svg>
  </span>;
}
