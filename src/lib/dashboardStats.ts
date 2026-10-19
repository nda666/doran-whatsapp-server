export const WIB_OFFSET = 7 * 60 * 60 * 1000;
/** Date buckets touched by a rolling interval, including partial first/last days. */
export function dashboardWindowDates(start: Date, end: Date) {
  const first = new Date(start.getTime() + WIB_OFFSET).toISOString().slice(0, 10);
  const last = new Date(end.getTime() + WIB_OFFSET).toISOString().slice(0, 10);
  const midnight = new Date(`${first}T00:00:00+07:00`).getTime();
  const lastMidnight = new Date(`${last}T00:00:00+07:00`).getTime();
  return Array.from({ length: Math.floor((lastMidnight - midnight) / 86400000) + 1 }, (_, i) => new Date(midnight + i * 86400000 + WIB_OFFSET).toISOString().slice(0, 10));
}
/** Calendar days in WIB, including today, with an exclusive upper bound. */
export function dashboardPeriod(days: number, now = new Date()) {
  const day = new Date(now.getTime() + WIB_OFFSET).toISOString().slice(0, 10);
  const today = new Date(`${day}T00:00:00+07:00`).getTime();
  const start = new Date(today - (days - 1) * 86400000);
  const end = new Date(today + 86400000);
  const dates = Array.from({ length: days }, (_, i) => new Date(start.getTime() + i * 86400000 + WIB_OFFSET).toISOString().slice(0, 10));
  return { start, end, dates };
}
