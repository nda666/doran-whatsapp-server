# Configurable dispatch queue order

Deployed on 14 October 2026. Build: `LpCuOlOco7tmGzO6UbMlG`.

Super admins can open Admin > Pengaturan Global > Urutan pemrosesan antrean, edit the setting and choose Data terlama dahulu (`oldest`) or Data terbaru dahulu (`newest`). The default is `oldest`; existing stored values are preserved during initialization.

Order is based on dispatch `createdAt`, with `id` as a deterministic tie breaker. The preference affects sender selection as well as the next job selected for each sender. Previously per-sender selection prioritized low attempt counts before age; the selected age order now takes precedence. Media failures retain their retry cooldowns, so jobs not yet due remain ineligible.

The worker reads the encrypted global setting on each poll and each per-sender selection; changing it requires no restart. Already selected/in-flight sends continue. Existing campaign schedules, sender leases, recipient deduplication, due-time conditions, age/deadline checks, acknowledgement handling, and per-device delays remain in effect. Newest-first can delay older jobs when new work keeps arriving.

Configuration key: `dispatch-queue-order`. API validates `oldest` or `newest`; invalid values are rejected. The global settings API remains restricted to super admins. No database migration was needed.

Verification:

- Application type checks passed locally, and the isolated VPS production build passed.
- Mock tests exercised oldest/newest per-recipient selection despite different attempt counts, changed the encrypted setting without restarting the worker, verified sender ranking SQL in both directions, validated API inputs, and checked due/age predicates. No real WhatsApp message was sent.
- Existing dispatch age tests passed locally.
- Live verification confirmed the setting in the authenticated API, the compiled worker getter, both dropdown labels in the admin bundle, and active worker polling.
- Existing health alerts were `BACKLOG_AGE_EXCEEDED` and `SENDER_OFFLINE_WITH_BACKLOG`, with 37 sockets connected. Those alerts predate this change.
- Post-deployment snapshot at 13:11:56 WIB confirmed concurrency 32, active claims/server acknowledgements, public HTTP 200, CPU busy 0.4%, app memory 437.7 MiB, and 26 MySQL connections. One pending sender reconnected (38 total connected sockets), so real existing jobs started processing. Ten jobs had recent sent timestamps and nine recent delivery timestamps. Some transport attempts subsequently returned unknown/error acknowledgements and followed the existing UNCERTAIN path; the snapshot contained one recent UNCERTAIN job, and later error log entries also showed acknowledgement failures. No transport behavior was changed by this deployment. Queue health continues to return HTTP 503 for old/offline backlog rather than a stopped worker.

Backup: `/home/jeblast/backups/doran-dispatch-order-1791958217`. The deployment built in isolation, preserved the source baseline, and retained previous `.next` and `dist` for rollback. Other PM2 processes retained their PIDs. Concurrency remains 32 and the application's existing pool and memory settings were preserved.

Deployment files: `prepare-deploy-dispatch-order.py`, `deploy-dispatch-order-20261014.py`, and `dispatch-order-20261014.zip`. Tests: `verify-dispatch-order.cjs` and `verify-dispatch-order-live.cjs`.
