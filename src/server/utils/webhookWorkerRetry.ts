/** Keep infrastructure failures from polling a broken database every two seconds. */
export function webhookWorkerRetry(event: string) {
  let failures = 0, retryAt = 0;
  return {
    ready: () => Date.now() >= retryAt,
    reset: () => { failures = 0; retryAt = 0; },
    fail: (error: unknown) => {
      const retryMs = Math.min(60000, 2000 * 2 ** Math.min(failures++, 5));
      retryAt = Date.now() + retryMs;
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "UNKNOWN";
      // Error messages and metadata can contain database URLs or webhook secrets.
      console.error(event, { code: /^[A-Z0-9_]{1,40}$/.test(code) ? code : "UNKNOWN", retryMs });
    },
  };
}
