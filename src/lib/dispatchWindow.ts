export type DispatchDisplayWindow = { days: number; start: string; end: string };

export function formatDispatchWindow(window: DispatchDisplayWindow, locale = "id-ID") {
  const format = new Intl.DateTimeFormat(locale, { timeZone: "Asia/Jakarta", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  return `${format.format(new Date(window.start))} – ${format.format(new Date(window.end))} (WIB)`;
}
