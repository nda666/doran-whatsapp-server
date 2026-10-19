# Sidebar — 17 Oktober 2026

Deployed to https://dashboard.jeblast.com. Only `src/components/Layout.tsx` changed in production.

Order: Dasbor, Percakapan, Perangkat WhatsApp, Kampanye pesan, Kalender pengiriman, Antrean Pengiriman; Kontak, Templat pesan, Pengelola berkas; Laporan, Riwayat aktivitas; Plugin AI, Dokumentasi API; Administrasi, Master Paket. Final two links and their separator remain limited to the designated super admin. Calendar uses its own icon.

Isolated production build passed. Initial verification incorrectly expected authenticated admin links in static HTML and triggered a successful rollback. Verification was corrected to check the initial static menu, authenticated session, and direct page authorization; deployed again successfully. Actual hydrated browser menus were then checked for existing admin and regular user accounts, including divider counts, desktop collapse, and mobile navigation that closes the menu. No test messages or account changes were made.

Local and public HTTPS checks passed for both roles. PM2 WhatsApp online, WhatsApp and dispatch enabled, Telegram PID unchanged. Source manifest verified, staging removed, previous complete runtime retained.

Build: `473OWBYf3bN01azinB_2X`.
Previous build: `f_Y54i0lUqMb8RiQWHrVx`.
Backup: `/home/jeblast/backups/doran-sidebar-refresh-1792210889`.
Deploy log: `sidebar-refresh-deploy-20261017.log`.
Browser screenshots: `output/sidebar-refresh-admin-20261017.png`, `output/sidebar-refresh-user-20261017.png`.
