import { DEFAULT_DISPATCH_DELAY, DispatchDelayRange } from "../../lib/dispatchSettings";

// Each caller draws independently: polling never shares a device's delay.
export function randomDispatchDelay(range: DispatchDelayRange = DEFAULT_DISPATCH_DELAY) {
  const min = range.minSeconds * 1000;
  const max = range.maxSeconds * 1000;
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** Time a person would need to type a message, with some variation: about 35 ms per character, 0.6–4.6 s. */
export function typingDelayMs(length: number, random: () => number = Math.random) {
  return Math.min(4000, 600 + Math.max(0, length) * 35) + Math.floor(random() * 600);
}
