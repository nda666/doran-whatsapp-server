/** Integer count axis with 1/2/5 intervals and enough room for the largest value. */
export function countAxis(maximum: number) {
  const max = Number.isFinite(maximum) ? Math.max(1, maximum) : 1;
  const targetStep = max / 3;
  const magnitude = 10 ** Math.floor(Math.log10(targetStep));
  const fraction = targetStep / magnitude;
  const step = Math.max(1, (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * magnitude);
  const intervals = Math.ceil(max / step);
  return { max: intervals * step, ticks: Array.from({ length: intervals + 1 }, (_, index) => index * step) };
}
