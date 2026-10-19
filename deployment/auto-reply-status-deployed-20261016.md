# Quick auto-reply activation

Deployed 16 October 2026 (Asia/Jakarta).

Status Balasan cells now provide an Aktif/Tidak aktif switch with per-row loading and accessible Aktifkan/Nonaktifkan labels. Changes save without opening the edit modal. The client blocks duplicate in-flight changes per rule and updates the matching device's displayed row only after API success. Failed saves show an error and retain the displayed status. Device-level activation remains separate.

PATCH /api/auto_reply/[id]?phone_id=... validates identifiers/status and updates only reply_status with existing authentication and owner/device scope. Existing DELETE behavior remains supported.

Validation: TypeScript, targeted lint (no warnings/errors), status API regression and modal regression passed. Isolated production build and deployment checks passed. HTTPS activation/deactivation of a temporary rule on an admin-owned disabled device persisted correctly and changed only status/timestamp. Invalid status returned 400, wrong device 404, unauthenticated request 401. Temporary rule deleted and absence verified; no messages sent. Existing authenticated UI/API/database checks passed. Live Chrome confirmed switches for active and inactive rows on the requested device. Existing production rules were not toggled during verification.

Build: `0Lkh4dwJhUOv6XZ6MIjhM`.
Backup: `/home/jeblast/backups/doran-auto-reply-status-1792090134`.
Log: `/home/jeblast/auto-reply-status-deploy-20261016.log`.
Screenshot: `output/auto-reply-status-live-20261016.png`.
Staging removed, backup retention completed, WhatsApp/dispatch flags and Telegram PID preserved.
