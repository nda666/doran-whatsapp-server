import { effectiveOperatingHours, operatingHoursState, type OperatingHours } from "../../lib/operatingHours";

export const pollStaleAfter = (maximumDelaySeconds: number) => Math.max(60_000, maximumDelaySeconds * 1000 + 30_000);

export function senderClaimDue(row: { nextDue: Date; readyAt?: Date | null; paused?: boolean | number | bigint | null; operatingHours?: unknown }, online: boolean, hours: OperatingHours, now: number) {
  return online && !row.paused && row.nextDue.getTime() <= now && (!row.readyAt || row.readyAt.getTime() <= now)
    && operatingHoursState(effectiveOperatingHours(hours, row.operatingHours), new Date(now)).open;
}
