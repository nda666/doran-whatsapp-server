# Random polling and per-device delays

Applied to the VPS on 14 October 2026 at 13:19 WIB.

- Replaced fixed one-second polling with recursive timeouts. After each poll completes, the worker independently draws a new delay between 2000 and 5000 ms. Startup also schedules its first poll in this range. Failed polls reschedule; shutdown cancels the pending timeout and drains active work.
- Ordinary per-device cooldown independently draws 2000–5000 ms when processing finishes and persists it in the sender lease's `nextSendAt`.
- Configuration: `DISPATCH_INTERVAL_MIN_MS=2000`, `DISPATCH_INTERVAL_MAX_MS=5000` in ecosystem configuration and environment. The old `DISPATCH_INTERVAL_MS` no longer controls this worker. New settings are validated as integer durations with maximum at least minimum.
- Campaigns retain their own random delay, bounded below by the newly drawn device delay. Offline/inactive devices retain the existing 30-second cooldown. Recovery, heartbeats and watchdog timings remain unchanged.
- Dispatch concurrency remains 32. Shared Prisma pool maximum remains 40, with pool timeout 10 seconds; heap and PM2 memory thresholds are unchanged.
- A device's actual time to its next send includes cooldown, waiting for a subsequent poll, and other queue/transport conditions; it is not guaranteed to send again within five seconds.

Deployment backed up source, compiled worker, ecosystem configuration, environment, and regression scripts at `/home/jeblast/backups/doran-random-delay-20261014T061905Z`. Only the worker and its new timing module needed compilation; the existing Next.js build was preserved. Only the WA process restarted, and other PM2 processes retained their PIDs. PM2 configuration was saved.

Verification:

- Application type checks passed locally and on the VPS; compiled runtime/config syntax checks passed.
- Mock timing tests covered both range endpoints, independent draws, rerandomization after successful and failed polls, offline cooldown preservation, and shutdown timer cleanup.
- Queue order and dispatch age regressions passed locally and on the VPS with mocked transport/database. No test WhatsApp message or production test row was created.
- Runtime startup confirmed concurrency 32, delayMinMs 2000, delayMaxMs 5000; worker PID 1354737. Live settings verification confirmed working dashboard endpoints, active polling and retained pool/memory configuration.
- A 20-second live observation measured successive completed poll intervals of 2679, 3235, 2588, 3583, 4007, and 2537 ms; 37 device sockets connected afterwards. Existing `BACKLOG_AGE_EXCEEDED` and `SENDER_OFFLINE_WITH_BACKLOG` alerts remain.

Deployment helper: `deployment/deploy-dispatch-random-delay.py`. Tests: `deployment/verify-dispatch-random-delay.cjs`, `deployment/verify-dispatch-order.cjs`, and `deployment/verify-dispatch-age-setting.cjs`.

Rollback restores backed-up worker source/runtime, ecosystem configuration and environment, removes the newly introduced timing module, restarts only `doran-whatsapp` with the restored configuration, and saves PM2. Dispatch database rows must be preserved.
