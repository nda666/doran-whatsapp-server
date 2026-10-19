import type { WaDispatchStatus } from "@prisma/client";

export type PhoneReportRow = {
  phoneId: string; number: string; name: string;
  total: number; sent: number; failed: number; waiting: number; uncertain: number; suppressed: number;
};
export const reportMetrics = ["total", "sent", "failed", "waiting", "uncertain", "suppressed"] as const;
export function emptyReportCounts() {
  return { total: 0, sent: 0, failed: 0, waiting: 0, uncertain: 0, suppressed: 0 };
}
export const successfulStatuses: WaDispatchStatus[] = ["SENT", "DELIVERED", "READ"];
export function reportMetric(status: WaDispatchStatus): Exclude<typeof reportMetrics[number], "total"> {
  if (successfulStatuses.includes(status)) return "sent";
  if (status === "FAILED") return "failed";
  if (status === "UNCERTAIN") return "uncertain";
  if (status === "SUPPRESSED") return "suppressed";
  return "waiting";
}
