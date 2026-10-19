# Deployment tujuh fitur Doran WA

Deployed 17 Oktober 2026 (WIB), setelah pengguna memberi instruksi eksplisit “deploy”.

- URL: https://dashboard.jeblast.com
- Build aktif: `2kztGc_gGc5F3k-zF3tbZ`
- Backup: `/home/jeblast/backups/doran-messaging-1792201846`
- Backup database: `database.sql.gz` di direktori backup tersebut, dengan izin akses terbatas.
- Paket: `messaging-improvements-20261017.zip`, SHA-256 `71e0f8fc0e1cd1265e64bd657f3d72819be4a268bdc9a0b77a447aad13df0c5f`.

## Verifikasi

Instalasi dependensi terisolasi, Prisma generate, uji perilaku, regresi personalisasi, build produksi, backup database, migrasi dan pengujian konkurensi MySQL lulus. Kandidat aplikasi berhasil dijalankan dengan transport dinonaktifkan dan API read-only diuji sebelum promosi.

Setelah promosi, keenam API baru merespons HTTP 200 dengan autentikasi; analytics harian/mingguan dan kalender juga lulus. Ekspor Excel (9.099 byte) dan PDF (1.967 byte) melalui aplikasi aktif berhasil. Karena belum ada campaign, pengujian menggunakan campaign sintetis berstatus COMPLETED dan dispatch READ, sehingga tidak dapat diproses worker. Fixture langsung dihapus setelah pengujian. Tidak ada pesan WhatsApp atau email pengujian dikirim.

Build HTTPS publik cocok dengan build aktif. Semua proses PM2 online; PID proses selain Doran WA tetap. Staging dibersihkan. Backup runtime sebelumnya dipertahankan dan retensi backup deployment berhasil.

## Kondisi operasional saat verifikasi

- Worker pengiriman berjalan.
- 46 dari 63 perangkat terhubung; 17 perangkat offline.
- Endpoint health mengembalikan HTTP 503 dengan BACKLOG_AGE_EXCEEDED dan SENDER_OFFLINE_WITH_BACKLOG. Ini bukan status seluruh pemeriksaan “sehat”; perangkat offline dan backlog masih perlu ditinjau.
- Deteksi STOP dan notifikasi offline untuk akun admin masih OFF, sesuai nilai awal. Email notifikasi memakai integrasi Postmark existing ketika diaktifkan.
- Batas awal pengiriman: 500 percobaan per perangkat per hari, interval minimum 5 detik; dapat diubah di Kesehatan perangkat.

## Akses fitur

- `/dashboard/messaging-settings`: ON/OFF STOP, ON/OFF notifikasi, email admin dan daftar blokir.
- `/dashboard/device-health`: kuota, skor operasional, jeda dan pemanasan.
- `/dashboard/calendar`: kalender dan perubahan jadwal.
- Halaman Dasbor: perbandingan periode dan performa perangkat.
- Kampanye pesan → Aksi → Laporan dan riwayat: laporan campaign serta ekspor Excel/PDF.
