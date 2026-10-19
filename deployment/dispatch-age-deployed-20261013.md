# Deployment batas usia antrean dan filter status

Aktif di https://dashboard.jeblast.com pada 13 Oktober 2026 (Asia/Jakarta).

Build ID: `QEtHPPWa8wsxwsIUMfwWO`.
Backup source/runtime: `/home/jeblast/backups/doran-dispatch-age-1791845918`.

- Pengaturan Global: `dispatch-max-age-days`, default 1 hari, input bilangan bulat 1–3650.
- Worker memakai batas usia sejak createdAt, termasuk antrean yang masih menunggu. Data terlalu lama ditandai FAILED; FAILED tidak diantrekan ulang otomatis.
- Antrean Pengiriman dibuka dengan filter Selain gagal; Semua status dan Gagal tetap tersedia.
- Build produksi Next.js dan TypeScript serta uji perilaku antrean pada staging lulus.
- Verifikasi live: setting default 1, API NOT_FAILED tanpa FAILED, pilihan FAILED/semua tetap tersedia, halaman terautentikasi menampilkan Selain gagal, worker dapat membaca pengaturan global.
- Source digest diverifikasi, PM2 doran-whatsapp online, WhatsApp dan dispatch tetap aktif, PID telegram-sender tetap sama.
- Tidak ada migrasi schema atau perubahan status tambahan dari aplikasi kasir.

Skrip deployment: `deploy-dispatch-age-20261013.py`, dengan rollback runtime/source otomatis saat verifikasi gagal.
