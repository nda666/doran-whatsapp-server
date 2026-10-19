# Pemulihan startup dashboard

Diterapkan 19 Oktober 2026 pukul 23.58 WIB atas permintaan pengguna.

Penyebab gangguan: dua cron `@reboot` menjalankan PM2 bersamaan. Pada boot
23.08 WIB muncul dua daemon untuk PM2_HOME yang sama. Log startup dashboard
berhenti di `Spawning PM2 daemon`; proses dashboard tidak terdaftar dan domain
publik merespons 503.

Perbaikan produksi:

- Skrip `/home/jeblast/.local/bin/start-jeblast-apps.sh` menjalankan startup
  `doran-whatsapp`, lalu `backendsms`, dengan lock bersama, timeout, dan retry.
- Dua cron startup diganti satu cron yang menjalankan skrip tersebut.
- Lingkungan PATH, HOME, dan PM2_HOME ditetapkan secara eksplisit.
- Proses yang online tidak dimulai ulang. Cron scheduler PHP dan maintenance
  harian tetap ada. Tidak menjalankan `pm2 save` karena saved list memuat proses
  lain yang tidak sedang aktif.
- Backup crontab:
  `/home/jeblast/.local/state/doran-startup/20261019-235828/crontab.before`.

Verifikasi: sintaks Bash lulus, skrip dijalankan dua kali dengan exit 0,
PID dashboard 8984 dan backendsms 7054 tetap sama. Pengujian ulang dengan
lingkungan minimal seperti cron juga lulus. Halaman signin publik HTTP 200.
Reboot server tidak dilakukan; jalur startup diuji langsung saat layanan aktif.

Pemeriksaan antrean menjelang 20 Oktober: 50 perangkat OPEN, 11 CLOSE;
5.449 pesan menunggu perangkat offline. Sisa antrean pada perangkat online
menunggu cooldown sampai reset kuota pukul 00.00 WIB. Tidak mengubah batas
pengiriman, me-reset sesi, atau memaksa pengiriman ulang.

Log pukul 00.00.13 WIB mengonfirmasi worker kembali mengambil pekerjaan dan
menerima server ACK setelah reset kuota. Peringatan CLAIM_STALLED hilang;
peringatan backlog dan perangkat offline masih sesuai kondisi antrean.
