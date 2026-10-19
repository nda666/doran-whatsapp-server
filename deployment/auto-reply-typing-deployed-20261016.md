# Auto-reply typing

Deployed 16 October 2026 (Asia/Jakarta).

Auto replies now read the current device showTyping setting and send composing presence to the incoming chat for 1.5 seconds before sending. Paused presence is sent on completion, send failure, or cancellation. Presence failures do not suppress replies. The active rule/device gate is checked again after the typing window. Existing reply delay remains in place; typing adds 1.5 seconds when enabled.

Only the sender source, its compiled module, and two regression scripts were promoted. The frontend build was preserved. Source baseline and concurrent-change checks passed, with automatic rollback available during promotion.

Validation: isolated server TypeScript compilation and typing/control regressions passed before deployment and regressions passed again afterward. Compiled composing/paused calls and duration verified. Sign-in HTTP returned 200. WhatsApp and Telegram processes online; WhatsApp/dispatch flags remained true; Telegram PID unchanged. Staging removed. No customer messages were sent during verification; customer-screen rendering has not been directly observed.

Backup: `/home/jeblast/backups/doran-auto-reply-typing-1792095966`.
Deployment script: `deployment/deploy-auto-reply-typing-20261016.py`.
