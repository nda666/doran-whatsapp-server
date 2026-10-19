# Restore Doran WA — 17 Oktober 2026

Active: https://dashboard.jeblast.com/dashboard

Restored sidebar brand to Doran WA and subtitle to WhatsApp Server; removed the decorative brand dot. Current sidebar design and navigation remain intact. Only src/components/Layout.tsx changed in production.

Isolated production build passed. Authenticated admin and regular user checks passed on localhost and public HTTPS, including brand text, sidebar links and role access. WhatsApp and dispatch enabled; application online; Telegram PID unchanged. First attempt rolled back automatically because its unauthenticated verifier received the login page. Final verification uses authenticated sessions.

Build: rb_ZuPueaUDMcBLSWaYfj
Backup: /home/jeblast/backups/doran-brand-restore-1792249474
Log: brand-restore-deploy-20261017.log
