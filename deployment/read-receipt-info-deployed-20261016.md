# Read receipt information

Deployed 16 October 2026 (Asia/Jakarta).

Added an information icon beside Read receipt in the shared add/edit phone form. Hover, keyboard focus, or click displays Indonesian help explaining automatic read marking, WhatsApp privacy behavior, and manual reading from the phone.

Only `src/components/phone/PhoneFormModal.tsx` changed in the deployment package. Live baseline diff reviewed. Isolated production build and existing regression checks passed, including auto-reply typing. Existing lint warnings remain. The first staging attempt stopped before promotion because a test filename was incorrectly replaced; corrected before the successful build.

Post-deployment: the server returned HTTP 200 for sign-in and the browser asset containing the tooltip text; WhatsApp and Telegram processes online; Telegram PID unchanged. Typing regression passed again. Staging cleanup and successful backup manifest verified.

Build: `vRVGgc6yukcUC07p6O1lz`.
Backup: `/home/jeblast/backups/doran-read-receipt-info-1792106929`.
Log: `/home/jeblast/read-receipt-info-deploy-20261016.log`.
