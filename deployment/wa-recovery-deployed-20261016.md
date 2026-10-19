# WhatsApp recovery and clear connection status — deployed 16 October 2026

User authorization: “ok deploy”. Deployment succeeded with isolated build/tests, baseline hash checks, runtime/source backup, app-only restart, health checks and staging cleanup. Existing backup retention policy retained this deploy's previous-version backup.

- Build: `IqdFUjn6Th9SEc-Zos5tW`.
- Backup: `/home/jeblast/backups/doran-wa-recovery-1792085077`.
- Package: `wa-recovery-20261015.zip` (16 files).
- Deploy script: `deploy-wa-recovery-20261015.py`.

Linked sessions recover at startup and are checked every 30 seconds. Closed cached sockets and initial connections stuck for 120 seconds are replaced. Existing transient retry backoff remains. Expired unpaired QR sessions no longer loop in the background. Database status-write failures do not prevent transport recovery. Cleanup, disabled devices, shutdown and terminal connection failures are respected.

Device rows and connection details now distinguish Online, QR required, automatic reconnection, pending recovery, pairing, inactive devices, server-disabled connections, terminal session errors and unverified inspection results. QR actions are offered only when the session is confirmed unlinked or logged out. Status refresh failures clear stale row connection labels and show a warning. The QR modal gives specific terminal-error guidance. No database migration was needed.

Validation passed in isolated production staging: backup retention and staging cleanup tests; connection info, recovery, cleanup, device webhook, connection status, registered phone and account-active tests; full Next.js/server TypeScript build.

Read-only production verification (`verify-wa-recovery-live.py`) passed:

- All 16 source hashes match the package, server runtime has the 30-second interval, browser device-page bundle contains the status implementation.
- PM2 app online (PID 1638185), WhatsApp/dispatch enabled. Telegram process retained PID 310531.
- Anonymous device-list API denied (401); authenticated device-list API succeeds and returns classified connection states.
- 39 devices Online, 20 require scan QR, one inactive. Every QR-required row was independently checked against current credential files and has no linked identity.
- JETE Nota 2, 3, 4, 5, 6, 7 New, 8, 9 and 12 require QR. JETE Nota 13 is Online.
- Public signin returns HTTP 200.

No WhatsApp test messages were sent, no QR was scanned, and no artificial production outage was induced. Historical cause of the missing credentials is unconfirmed. Recovery handles transient transport problems; confirmed missing links still require the user to scan QR.
