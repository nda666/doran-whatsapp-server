# Dispatch updated_at deployed

11 October 2026 (Asia/Jakarta), https://dashboard.jeblast.com/dashboard/dispatch.

Added Diperbarui after Dibuat, formatted DD/MM/YYYY HH:mm:ss using database updatedAt. Dashboard API exposes updated_at and supports sorting by updated_at. Existing refresh every five seconds remains in place. Timestamp describes the latest data update, including status changes and worker metadata updates.

Build: xyqX_LGkHdH5BHan5WiV8.
Backup: /home/jeblast/backups/doran-dispatch-updated-at-1791717269.

Changed-file lint, isolated production build and existing regression checks passed. Authenticated live table headers, API timestamps bounded by before/after database reads, and updated_at sorting passed. Eight dashboard pages and thirteen read-only APIs passed. Dashboard online, WhatsApp and dispatch enabled, Telegram PID unchanged, deployed hashes match package. No verification messages sent.

First deployment rolled back automatically because an active job updated between API and database reads. Verification was corrected to allow concurrent updates and the second deployment passed.
