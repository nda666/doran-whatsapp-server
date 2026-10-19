# Dispatch modal status deployed

11 October 2026 (Asia/Jakarta), https://dashboard.jeblast.com/dashboard/dispatch.

Replaced unconditional pending/sending guidance with a status label and description matching the current detail status. Table and modal share the same status labels. Modal detail polls every five seconds. Retained message content and retention warnings remain available.

Transaction 5553753 verified read-only: table, detail endpoint and database all report READ. Tests rendered all seven status variants, READ without pending guidance, polling, retention, stale selected ID and error state. Changed-file lint, isolated full production build, existing regressions and live updated_at check passed. Eight pages and thirteen read-only APIs passed. No verification messages sent.

Build: zbVTf-RoToxHuc5DRpaCC.
Backup: /home/jeblast/backups/doran-dispatch-modal-status-1791717794.
Dashboard online; WhatsApp and dispatch enabled; Telegram PID unchanged; deployed source hashes verified.
