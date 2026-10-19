Deployed 10 October 2026 to https://dashboard.jeblast.com.

Sidebar order: Dashboard, Campaign / Blast, Antrean Pengiriman, Laporan, Log, Kontak, File Manager, Phone Devices, API Docs, Master Paket, Admin Panel. The final two items remain restricted to ADMIN.

Only src/components/Layout.tsx changed in production. Staging copied the current live source and dependencies. A comparison confirmed that only navigation changed. Production Next.js and server TypeScript build passed before promotion.

Live verification passed: eight authenticated public HTTPS pages, thirteen read-only APIs, public rendered sidebar order, deployed source SHA-256, PM2 online state, and unchanged Telegram PID. All 68 devices remained registered, 65 active and 16 online; WhatsApp and durable dispatch remain enabled. No test message was sent.

Backup: /home/jeblast/backups/doran-sidebar-order-20261010. It retains source-before.tar.gz, build.log, changed-source-before, existing-files.json, and previous-runtime/.next and dist. For rollback, stop only doran-whatsapp, restore the saved Layout.tsx and previous runtime, then startOrReload the existing ecosystem configuration. Preserve current database and sessions.

Scripts: prepare-sidebar-order-20261010.py, deploy-sidebar-order-20261010.py, verify-sidebar-order-live-20261010.cjs.
