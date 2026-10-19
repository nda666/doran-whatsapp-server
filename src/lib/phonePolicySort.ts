export const phonePolicySortFields = ["health", "quota", "sendInterval"] as const;
export type PhonePolicySort = typeof phonePolicySortFields[number];

export function isPhonePolicySort(value: unknown): value is PhonePolicySort {
  return typeof value === "string" && phonePolicySortFields.includes(value as PhonePolicySort);
}

type SortRow = { id: string; health: number | null; quota: number; sendInterval: number };

/** Missing health scores stay last in either direction; IDs break ties across pages. */
export function sortPhonePolicies(rows: SortRow[], field: PhonePolicySort, order: "asc" | "desc") {
  const direction = order === "asc" ? 1 : -1;
  return [...rows].sort((first, second) => {
    const a = first[field], b = second[field];
    if (a === null && b !== null) return 1;
    if (a !== null && b === null) return -1;
    const difference = a === null || b === null ? 0 : (a - b) * direction;
    return difference || first.id.localeCompare(second.id);
  });
}
