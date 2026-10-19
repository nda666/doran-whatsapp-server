const DAY = 86_400_000;
const WIB_OFFSET = 7 * 60 * 60 * 1000;

export function defaultDispatchDates(now = Date.now()) {
  const today = new Date(now + WIB_OFFSET).toISOString().slice(0, 10);
  const start = new Date(Date.parse(`${today}T00:00:00Z`) - 2 * DAY).toISOString().slice(0, 10);
  return { start_date: start, end_date: today };
}

function dateBoundary(value: unknown): Date {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Tanggal harus menggunakan format YYYY-MM-DD.");
  }
  const date = new Date(`${value}T00:00:00+07:00`);
  if (!Number.isFinite(date.getTime()) || new Date(date.getTime() + WIB_OFFSET).toISOString().slice(0, 10) !== value) {
    throw new Error("Tanggal tidak valid.");
  }
  return date;
}

export function dispatchDateFilter(start: unknown, end: unknown) {
  if (start === undefined && end === undefined) return {};
  const gte = dateBoundary(start);
  const lastDay = dateBoundary(end);
  if (gte > lastDay) throw new Error("Tanggal selesai harus sama atau setelah tanggal mulai.");
  return { gte, lt: new Date(lastDay.getTime() + DAY) };
}
