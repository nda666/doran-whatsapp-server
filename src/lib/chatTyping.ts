// Event-driven heartbeats avoid leaving typing active for an untouched draft.
export function createChatTypingReporter(notify: (typing: boolean) => void) {
  let active = false, lastSent = 0;
  let idle: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    if (idle) clearTimeout(idle);
    idle = undefined;
    if (active) notify(false);
    active = false;
  };
  return {
    input(hasText: boolean) {
      if (!hasText) { stop(); return; }
      const now = Date.now();
      if (!active || now - lastSent >= 4000) { active = true; lastSent = now; notify(true); }
      if (idle) clearTimeout(idle);
      idle = setTimeout(stop, 3000);
    },
    stop,
  };
}
