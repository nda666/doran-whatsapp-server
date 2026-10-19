# Filter awal Menunggu pengiriman

Aktif di https://dashboard.jeblast.com/dashboard/dispatch pada 13 Oktober 2026 (Asia/Jakarta).

Build ID: `8MiVKvI207kRMRUuqLNxY`.
Backup source/runtime: `/home/jeblast/backups/doran-dispatch-queued-1791846167`.

- Filter awal query dan formulir: QUEUED (Menunggu pengiriman).
- Opsi Selain gagal dihapus, berikut penanganan filter khusus NOT_FAILED di API dashboard.
- Filter Semua status dan status individual tetap tersedia.
- TypeScript aplikasi, lint, dan build produksi terisolasi berhasil.
- Verifikasi live: API QUEUED/FAILED benar, halaman terautentikasi tersedia, bundle memuat default QUEUED untuk query/form dan tidak memuat opsi Selain gagal.
- PM2 doran-whatsapp online, WhatsApp/dispatch aktif, PID telegram-sender tetap sama.
- Tidak ada perubahan worker atau pengaturan usia antrean pada deployment ini.
