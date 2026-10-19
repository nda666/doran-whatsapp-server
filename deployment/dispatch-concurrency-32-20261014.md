# Dispatch concurrency 32

Requested and applied on 14 October 2026 at 12:24 WIB.

## Change

- Raised worker hard cap from 16 to 32; runtime PM2 concurrency is 32.
- Updated local worker source, PM2 configuration, environment example, local environment, and live PM2 verification expectation.
- Backed up VPS source, compiled worker, PM2 configuration, environment and verification script at `/home/jeblast/backups/doran-concurrency-32-20261014T052400Z`.
- Updated VPS source and compiled only the changed worker using its existing TypeScript compiler settings. Other compiled files and Next.js assets were preserved.
- Kept the per-device interval at 1000 ms. No change to acknowledgement handling, campaign delays, or MySQL settings.
- Restarted only `doran-whatsapp` and saved the PM2 configuration. Other PM2 processes retained their PIDs.

## Verification

- Application TypeScript checks passed locally and on the VPS. The broad tsconfig initially included incomplete temporary backup copies; validation used the actual application files under `src` and `next-env.d.ts` to avoid those unrelated copies.
- Compiled worker syntax check passed. Runtime startup logged `concurrency:32`, `gap:1000`; PID 1345380.
- Baseline at 12:23 WIB: concurrency 16, CPU busy 3.4%, app memory 516.1 MiB, available memory 21,727 MiB; MySQL 27 connections against a maximum of 151.
- Observations at approximately 30-second intervals starting at 12:24:37 WIB: application stayed online, PID unchanged, restart count remained 41 (one intentional restart from baseline count 40).
- Seven observations from 12:24:37 to 12:27:48 WIB: CPU busy 0.3–2.1%, app memory 409.4–659.6 MiB, available memory at least 21,618 MiB; MySQL 22–28 connected clients and 2–6 running threads. Public sign-in returned HTTP 200 each time; dispatch worker polling and recovery remained current.
- No logged dispatch poll/job/ACK/heartbeat/recovery/media failures in the observed five-minute log windows; no recently updated UNCERTAIN jobs.
- Health endpoint returned HTTP 503 because of the existing `BACKLOG_AGE_EXCEEDED` and `SENDER_OFFLINE_WITH_BACKLOG` alerts. This is not a fully healthy queue result.
- 37 connected devices had no eligible queued jobs. All eligible backlog belonged to 20 offline sender devices: 7,232 jobs at baseline, 7,234 by 12:26 WIB. No jobs were claimed after restart during the entire observation window.

## Limit of the result

The application is stable under the observed workload with concurrency configured to 32. This does not prove sustained throughput or stability with 32 simultaneous active sends, because offline sender devices prevented the pending jobs from being sent. No synthetic WhatsApp message was created.

## Rollback

Restore the backed-up worker source, compiled worker, ecosystem configuration, environment and live verification script, restart only `doran-whatsapp` with the restored ecosystem configuration and `--update-env`, then save PM2. Do not delete or roll back dispatch database rows.

The reusable deployment/observation helper is `deployment/concurrency-32-control.py`. Its `snapshot` and `observe` modes are read-only. Its `apply` mode expects runtime concurrency 16 and stops otherwise.
