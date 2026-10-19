# Setting batas pemanasan — 19 Oktober 2026 WIB

Deployed to https://dashboard.jeblast.com/dashboard/admin.

Setting global: Batas percobaan pemanasan per hari (warmup-daily-limits).
Default: 25,50,100,200,350,500. Accepts increasing integers 1–100000 separated by commas; whitespace is normalized. Each stage lasts two days, then device quota applies. Device quota remains the maximum. Changes apply on subsequent sends without resetting warmup start dates.

Isolated synthetic tests, phone warmup regression checks, Next.js production build and server TypeScript build passed. Production authenticated API checks passed for setting registration, form limits, effective device limits, invalid input rejection and anonymous access rejection. HTTPS verification confirmed active build and setting assets. PM2 online, WhatsApp and dispatch queue enabled, Telegram PID preserved. No test messages sent.

Build: L0xPAFd5BWILAoKvBmHJh
Backup: /home/jeblast/backups/doran-warmup-limits-1792387177
Deployment log: deployment/warmup-limits-deploy-20261019.log
Public verification: deployment/warmup-limits-public-verify-20261019.log
