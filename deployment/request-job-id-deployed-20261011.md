# Request job_id deployment

Deployed to https://dashboard.jeblast.com on 11 October 2026 (Asia/Jakarta).

Build: `xf9Ij37RBkAl1VLe9e5cH`.
Backup: `/home/jeblast/backups/doran-request-job-id-1791680386`.
Migration: `20261011120000_request_job_id`, adding nullable `requestJobKey` and its index to `wa_dispatches`.

Isolated Prisma generation, request-job-id tests, send-response regression tests, API-toolkit tests and the full production build passed. The generated Prisma Client was isolated during build and promoted with the runtime. Source hashes matched the package manifest after promotion.

The original deploy script encountered Python compatibility trouble (`shutil.copytree` lacks `dirs_exist_ok` on this VPS) after migration, before runtime promotion. The original runtime was restarted and returned HTTP 200. `resume-request-job-id-20261011.py` then promoted the already verified build using a compatible overlay copy. The main deploy script was corrected too. The additive migration was retained; no database rollback was required.

Real database tests verified creation, multiple recipients, retry without payload, latest READ status, stable dispatch IDs and device isolation within a transaction. All test writes were rolled back and the absence of fixture rows confirmed. No test dispatch was committed or sent to WhatsApp.

Live HTTPS checks passed for job_id dry-run and invalid-ID validation on all four send-message aliases, job_id status lookup on public/nonpublic send-status, and invalid-ID validation for seven other queue send APIs. Existing device-API parity checks, eight authenticated dashboard pages, thirteen read-only APIs and toolkit download hashes passed.

PM2 `doran-whatsapp` is online, WhatsApp and durable dispatch remain enabled, and the Telegram process PID was unchanged. PM2 process configuration was saved. Database dump, previous source/runtime and generated Prisma Client are preserved in the private backup directory.
