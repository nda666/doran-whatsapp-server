# Pemulihan reset Nota 2 dan Nota 25 — 9 November 2026

Reset kedua perangkat berhasil melalui layanan `cleanupPhone` pada runtime produksi,
dengan layanan WA dihentikan sementara untuk mengosongkan transaksi yang tertahan.
Layanan WA dinyalakan kembali melalui blok `finally` pada helper pemulihan.

- Nota 2: selesai sekitar 15:40:05 WIB, durasi 39,8 detik.
- Nota 25: selesai sekitar 15:41:01 WIB, durasi 56,2 detik.
- Baris perangkat dipertahankan, `active=1`, `status=CLOSE`, `isOnline=false`.
- Nomor akun, kontak, dispatch, protocol history dan auth keys telah kosong.
- Token API kedua perangkat dibandingkan sebelum/sesudah dan tetap sama.
- Pemulihan membutuhkan scan QR ulang.

## Penyebab dan perbaikan

Log menunjukkan timeout transaksi P2028 dan lock wait timeout MySQL 1205.
EXPLAIN query penghapusan webhook awal memindai sekitar 80.007 baris event.
Indeks `dispatch_webhook_events_dispatchId_idx` dipasang secara online di produksi.
EXPLAIN setelahnya menggunakan indeks phoneId pada dispatch dan indeks dispatchId
pada event, dengan estimasi dua event per dispatch.

Percobaan API normal tetap gagal di tengah beban I/O tinggi dan transaksi tertahan.
Reset pemulihan memakai implementasi runtime yang sama dengan Prisma client khusus
berbatas transaksi 120 detik, sesudah proses aplikasi berhenti. Batas transaksi
runtime aplikasi tidak diubah. Indeks mengurangi pemindaian, tetapi reset riwayat
besar pada kondisi disk serupa masih dapat melampaui batas transaksi standar.

## Cadangan dan migrasi

Data masing-masing perangkat dicadangkan sebelum penghapusan di file privat
`/home/jeblast/backups/nota-reset-20261109-*/<phoneId>.json` (mode 0600).
Cadangan mencakup phone, dispatch, attempt, webhook event, kontak, auto-reply,
protocol dan autentikasi. Tidak ada percakapan tersimpan pada kedua perangkat.
Schema sebelum indeks: `/home/jeblast/backups/cleanup-index-1794213004/schema.prisma`.

Percobaan awal `migrate deploy` menemukan riwayat migrasi produksi yang belum
dibaseline: migrasi alignment legacy inbox/phone FK selesai, lalu sender_groups
berhenti pada CREATE TABLE pertama karena tabel sudah ada. Penanda gagal tersebut
ditandai rolled back; tidak ada langkah sender_groups selanjutnya dijalankan.
Indeks yang diperlukan kemudian diterapkan secara khusus dan ditandai applied.
Verifikasi menemukan nol migrasi gagal aktif. Migrasi historis yang masih pending
perlu dicocokkan dengan schema nyata sebelum deploy migrasi umum berikutnya.

## Validasi

- `node deployment/verify-phone-cleanup.cjs`: lulus setelah mock akses, auth DB,
  dan protocol history disesuaikan dengan implementasi saat ini.
- Prisma schema validate: lulus.
- Pemeriksaan hasil reset dari database: seluruh hitungan target nol.
- PM2: doran-whatsapp, telegram-sender, backendsms, logrotate online.
- `/signin`: HTTP 200. `/health/dispatch`: HTTP 200, healthy=true pada snapshot
  pemulihan awal; koneksi perangkat lain masih pulih bertahap.
- Pemeriksaan akhir: `LOGIN_DATABASE_DISPATCH_READY` lulus, polling dan sampling
  antrean kembali berjalan, 54 perangkat online. Peringatan
  `SENDER_OFFLINE_WITH_BACKLOG` tetap ada, sesuai kondisi yang sudah muncul sebelum
  penghentian layanan; tidak dilakukan bulk retry atau pengubahan status pesan
  perangkat lain.

Helper operasional tersimpan di `tmp/*nota*20261109.py` dan
`tmp/*cleanup*20261109.py`. Tidak ada deploy runtime aplikasi pada pekerjaan ini.
