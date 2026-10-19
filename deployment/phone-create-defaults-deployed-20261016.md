# New device defaults

Deployed 16 October 2026 (Asia/Jakarta).

The add-device form now initializes readReceipt, showOnline, and showTyping to true. Device creation through the API also defaults these fields to true when omitted. Explicit false values are preserved. Editing applies only supplied fields and does not apply creation defaults. Existing devices and database schema defaults were not changed.

Validation: focused API regression covers omitted create options, explicit opt-out, name-only edit, and explicit edit values. Isolated production build and existing regression checks passed. After deployment the served browser asset contains all three enabled form defaults. Sign-in HTTP 200, WhatsApp/Telegram online, Telegram PID unchanged. API-default and auto-reply-typing regressions passed again. Backup success and staging cleanup verified.

Build: `48H7SOwXor8H9FGHjd8g5`.
Backup: `/home/jeblast/backups/doran-phone-create-defaults-1792107571`.
Log: `/home/jeblast/phone-create-defaults-deploy-20261016.log`.
