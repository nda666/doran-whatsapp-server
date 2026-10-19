# Dispatch concurrency 16

Applied on 14 October 2026 at 12:12 WIB to `doran-whatsapp` on the VPS.

- PM2 `DISPATCH_CONCURRENCY` increased from 4 to 16; the existing worker supports this limit without rebuilding.
- Per-device interval remains 1000 ms. Campaign delays and acknowledgement handling are unchanged.
- Updated local PM2 config, environment example, local environment, and the live PM2 verification expectation. Updated VPS PM2 config, its environment value, and live verification expectation.
- Restarted only `doran-whatsapp` and saved PM2 configuration. Other PM2 processes retained their PIDs.
- Worker startup confirmed `concurrency:16` and `gap:1000`; runtime PM2 environment confirmed 16. Sign-in returned HTTP 200 and worker polling was active.
- Initial health snapshot: 36 connected sockets, 7,223 queued eligible jobs; HTTP 503 reflected `BACKLOG_AGE_EXCEEDED` and `SENDER_OFFLINE_WITH_BACKLOG`, rather than a stopped worker. This is a startup snapshot, not a delivery throughput measurement.
- Original VPS configuration backup: `/home/jeblast/backups/doran-concurrency-16-20261014T051232Z`; the first attempt stopped before restart because remote Python 3.6 does not support `capture_output`. The successful retry backup is `/home/jeblast/backups/doran-concurrency-16-20261014T051246Z`, taken after configuration edits. Use the first backup for the original concurrency-4 files, or explicitly restore the concurrency value to 4.
