import { DEFAULT_DISPATCH_DELAY, DispatchDelayRange } from "../../lib/dispatchSettings";

// Each caller draws independently: polling never shares a device's delay.
export function randomDispatchDelay(range: DispatchDelayRange = DEFAULT_DISPATCH_DELAY) {
  const min = range.minSeconds * 1000;
  const max = range.maxSeconds * 1000;
  return min + Math.floor(Math.random() * (max - min + 1));
}
