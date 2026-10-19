# Retensi satu versi dan preset reset perangkat

Live build: `RoCm-YSiSK3e9DG6D_Lq5`.

Satu backup versi sebelumnya: `/home/jeblast/backups/doran-reset-preset-1792025502`, berisi runtime build `1MoAH_dJeAgPMEKWDuy3U`.

- Retensi otomatis berjalan setelah deploy, build, dan pemeriksaan kesehatan berhasil. Sebanyak 167 backup versi aplikasi yang lebih lama dibersihkan; daftar disimpan pada `/home/jeblast/backups/deploy-backup-retention.json`.
- Sepuluh kelompok cadangan database/sesi/storage dipisahkan ke `/home/jeblast/backups/data-backups`, termasuk konfigurasi/migration log terkait bila tersedia. Cadangan data dan konfigurasi PM2 tidak mengikuti retensi versi aplikasi.
- Ukuran seluruh folder backup turun dari sekitar 43G ke 3.4G. Hanya satu direktori backup versi aplikasi tersisa.
- Paket incoming `/home/jeblast/admin-api-token-incoming-20261010` dihapus setelah path dan proses aktif diperiksa.
- Checkbox **Reset seperti perangkat baru** memilih seluruh tindakan kecuali hapus baris perangkat, termasuk membatalkan pilihan hapus baris jika sebelumnya dicentang. Checkbox mengikuti perubahan pilihan individual; melepas centangnya mengosongkan pilihan.
- Tes unit preset/retensi, TypeScript, build Linux, API live, dan browser live lulus. Konfirmasi kedua tetap tersedia. Semua fixture dibersihkan dan token perangkat lama tetap utuh.
- Proses Jeblast, Telegram, dan logrotate online; repos hanya berisi direktori aplikasi utama.

Bukti UI: `output/phone-reset-preset-live-20261015.png`.
