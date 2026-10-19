# Informasi Sistem accordion — 12 October 2026

Deployed to https://dashboard.jeblast.com/dashboard/admin.

The four sections Pengelolaan Proses PM2, Stack teknologi, Queue & cache, and Git & CI/CD now use an Ant Design accordion, initially closed, with one section open at a time. Existing content and nested guide panels remain available. The PM2 online status stays visible in its accordion header.

Validation: application-source TypeScript check passed; isolated Linux production Next.js build and server compilation passed; live PM2 access and settings verification passed. Chrome confirmed all four panels initially collapsed, PM2 content loaded on expansion, and selecting Stack teknologi automatically collapsed PM2.

Build ID: ecFPsy19Bg2t6ulgDhyMF.
Backup: /home/jeblast/backups/doran-system-info-accordion-1791810024.
Screenshot: output/system-info/accordion-live.png.
Deployment restarts only doran-whatsapp and verifies the Telegram process PID is unchanged.
