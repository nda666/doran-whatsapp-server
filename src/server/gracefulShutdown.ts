type ShutdownOptions = {
  stopIntake: () => void;
  drain: Array<() => Promise<void> | undefined>;
  close: Array<() => Promise<void>>;
  timeoutMs?: number;
  exit?: (code: number) => void;
  log?: (event: string, details: object) => void;
};

// One shutdown promise is shared by repeated SIGINT/SIGTERM signals.
export function createGracefulShutdown(options: ShutdownOptions) {
  let running: Promise<void> | undefined;
  const exit = options.exit || ((code: number) => process.exit(code));
  const log = options.log || ((event: string, details: object) => console.info(event, JSON.stringify(details)));
  return (signal: string): Promise<void> => {
    if (running) return running;
    running = Promise.resolve().then(async () => {
      const started = Date.now();
      let finished = false, failed = false;
      log("SERVER_SHUTDOWN_STARTED", { signal });
      const deadline = setTimeout(() => {
        if (finished) return;
        finished = true;
        log("SERVER_SHUTDOWN_TIMEOUT", { signal, durationMs: Date.now() - started });
        exit(1);
      }, options.timeoutMs || 60_000);
      const attempt = async (action: () => void | Promise<void>, stage: string) => {
        try { await action(); }
        catch { failed = true; log("SERVER_SHUTDOWN_STAGE_FAILED", { stage }); }
      };
      await attempt(options.stopIntake, "intake");
      await Promise.all(options.drain.map((action, index) => attempt(async () => { await action(); }, `worker-${index}`)));
      for (let index = 0; index < options.close.length; index++) {
        if (finished) return;
        await attempt(options.close[index], `close-${index}`);
      }
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      log("SERVER_SHUTDOWN_COMPLETED", { signal, durationMs: Date.now() - started, failed });
      exit(failed ? 1 : 0);
    });
    return running;
  };
}
