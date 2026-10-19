# Database pool for dispatch concurrency 32

Applied on 14 October 2026 at 12:51 WIB.

## Configuration

- Runtime dispatch concurrency remains 32.
- Added `connection_limit=40` and `pool_timeout=10` to the application's existing MySQL `DATABASE_URL`, preserving credentials and other URL parameters. The prior URL contained no explicit pool size or timeouts.
- Forty is a maximum for the shared Prisma pool, with capacity above the 32 concurrent workers for dashboard, receipt and webhook work. Those extra connections are not reserved exclusively for particular callers.
- The shared Prisma client in `src/lib/prisma.ts` already reuses one pool across the custom server and API routes. No application code or schema migration was required.
- Retained Node old-space heap limit 4096 MiB and PM2 memory restart threshold 6144 MiB. Observed application RSS below 700 MiB does not justify increasing those limits. RSS includes native allocations and buffers outside the JavaScript heap.
- MySQL global connection limit remains 151. No global MySQL setting was changed.
- Updated local environment, environment example, and live verification script. Applied the environment URL and verification changes on the VPS, restarted only `doran-whatsapp`, and saved PM2. Other PM2 processes retained their PIDs.
- Backup of original VPS environment, PM2 configuration, and verification script: `/home/jeblast/backups/doran-pool32-20261014T055109Z`, directory mode 700 and backup files mode 600.

## Verification

- A temporary Prisma client logged that its MySQL pool has 40 connections.
- Forty concurrent read-only `SELECT CONNECTION_ID(), SLEEP(0.1)` queries completed successfully in 187 ms and used 40 distinct connections. The client disconnected afterwards. No customer data was changed and no WhatsApp test message was created.
- Live PM2 verification confirmed concurrency 32, the pool URL parameters, heap/restart limits, HTTP 200 on local/public sign-in, and worker polling. PID after restart: 1349438; restart count 42.
- Five post-restart samples from 12:51:40 through 12:53:49 WIB showed CPU busy 0.5–3.5%, app RSS 386.2–438.2 MiB, available RAM at least 21,828 MiB, 8–18 MySQL connected clients, and no dispatch failures in the observed log windows. Process PID and restart count remained unchanged.
- MySQL historical peak connections became 91 after the concurrent connection test, below its 151 maximum; this is a high-water mark, not current usage. Aborted connection count stayed 440 throughout post-restart samples.
- Existing dispatch health alerts remain `BACKLOG_AGE_EXCEEDED` and `SENDER_OFFLINE_WITH_BACKLOG` (HTTP 503). The worker itself is running and polling.
- Eligible backlog: 7,265 messages assigned to 20 offline senders; 37 other devices connected. No new job claim occurred during the initial monitoring window.

## Scope and limitations

The read-only test verifies that the pool can expand to 40 connections and process a concurrent burst. The monitoring verifies stability at the observed workload, not end-to-end throughput with 32 simultaneous WhatsApp sends. Offline sender backlog still requires reconnection.

The reusable deployment helper is `deployment/optimize-concurrency-32.py`; its `local` argument updates local pool parameters without printing credentials. Server deployment checks for a conflicting PM2 database URL override and aborts rather than silently changing which database is used.

## Rollback

Restore the backed-up `.env` and verification script, restart only `doran-whatsapp` using its ecosystem configuration with `--update-env`, and save PM2. Dispatch rows do not need to be changed.
