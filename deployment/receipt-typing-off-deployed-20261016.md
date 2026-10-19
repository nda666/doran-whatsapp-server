# Read receipt and typing disabled

Deployed 16 October 2026 (Asia/Jakarta).

Disabled readReceipt and showTyping for all 61 existing devices; 56 devices changed. Verified after deployment: zero devices have either option enabled. Other device options were preserved. The add-device form and creation API now default both options to false, preserving explicit user choices.

Settings backup: `/home/jeblast/backups/receipt-typing-settings-1792127567.json` (mode 0600).
Deployment backup: `/home/jeblast/backups/doran-receipt-typing-off-1792127567`.
Build: `PE_dkzj0ElsDVzG-x41iM`.
Log: `/home/jeblast/receipt-typing-off-deploy-20261016.log`.

Validation: isolated production build and deployment regressions passed; creation-default regression passed again against deployed source. Sign-in HTTP 200, WhatsApp and Telegram processes online, Telegram PID preserved, staging removed.
