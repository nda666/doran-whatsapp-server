# Auto-reply form reset

Deployed 16 October 2026 (Asia/Jakarta).

Message-specific inputs now follow Ant Design's watched type_message field. New forms default to text. Successful saves reset the actual auto-reply modal reference. Reset also restores the keyword matching state.

Validation: local TypeScript and targeted lint passed (one existing hook dependency warning); modal lifecycle regression and keyword input checks passed. Isolated Linux production build and deployment regression checks passed. Application readiness, PM2 online status, WhatsApp/dispatch flags, unchanged Telegram PID, source digests, authenticated HTTPS page bundles, API/device consistency and database defaults verified. Live Chrome confirmed Text Message and visible Pesan Teks on first open and reopening. Drafts cancelled; no rules created or messages sent during live checks. Save/reset behavior covered by the mocked lifecycle regression.

Build: `hjgv3BBr1iKp8TLqz-zdB`.
Backup: `/home/jeblast/backups/doran-auto-reply-form-reset-1792086531`.
Log: `/home/jeblast/auto-reply-form-reset-deploy-20261016.log`.
Screenshot: `output/auto-reply-form-reset-live-20261016.png`.

Staging cleaned after successful promotion. Previous runtime/source retained in the deployment backup; retention completed.
