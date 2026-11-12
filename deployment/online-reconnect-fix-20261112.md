# Perbaikan pemulihan auth dan status online — 12 November 2026

## Perubahan

- Owner auth lokal selalu dilepas dari registry setelah penutupan selesai, termasuk jika pelepasan lease database gagal. Promise rejected tidak lagi menahan reconnect selamanya.
- Error penutupan owner lama tidak menghentikan percobaan akuisisi lease baru. Lease database tetap menjadi pagar: lease aktif milik proses lain atau lease lama yang belum kedaluwarsa tidak boleh direbut.
- Kehilangan auth memicu rekonsiliasi status offline. Watchdog mengulang rekonsiliasi jika database sempat tidak tersedia, termasuk untuk perangkat yang sedang menunggu timer atau diblokir dari reconnect.
- Rekonsiliasi mengunci row perangkat dan memeriksa ulang identitas/kesiapan socket setelah menunggu database. Socket pengganti yang sudah tersambung tidak boleh ditimpa proses offline yang terlambat. Waktu offline pertama dipertahankan pada pemeriksaan berulang.
- Tidak ada perubahan kuota, aturan routing, migration, penghapusan kredensial, atau bulk retry pesan ambigu.

## Validasi

- `npm run build:tsc`: lulus lokal.
- `npm run lint`: lulus; warning React Hook yang sudah ada tetap dilaporkan.
- `node deployment/ci-tests.cjs`: seluruh suite lulus lokal setelah sandbox mengizinkan tes HTTP loopback; satu integrasi Linux rsync dilewati di Windows.
- Staging Linux: build Next.js dan server TypeScript, validasi guard lintas bundle, seluruh suite regresi, serta lint lulus.
- Regresi baru mencakup gagal release, write queue gagal, reconnect setelah lease kedaluwarsa, penolakan lease aktif, registry bersama lintas bundle, database gagal lalu pulih, waktu offline tidak bergeser, serta koneksi pengganti yang muncul/tersambung selama menunggu lock.

## Deployment

Snapshot sebelum promosi, 16.09 WIB: 48 online di database, 44 koneksi di worker. Selisihnya Nota 22, Store DG Bandung, JETE Transicon, dan Store DG TSM Makassar.

Staging dan semua artefak sementara server berada di `/home/jeblast/repos/.doran-work-online-reconnect-20261112/`. Backup pemulihan berada di `/home/jeblast/repos/doran-backups/doran-online-reconnect-1794474267/`.

Backup penuh pertama gagal sebelum lengkap. Runtime produksi belum diganti saat kegagalan ini. Backup diulang memakai jalur dump yang sama dengan batas waktu lebih panjang; file parsial dipertahankan sampai backup pengganti dan deployment berhasil diverifikasi.

Deployment berhasil. Build aktif: `yXuVgJ-OA45jaHrWHFmHH`. Worker dimulai kembali pada 16.37.36 WIB. Runtime sebelumnya dan source awal disimpan bersama backup database lengkap berukuran 2.236.634.453 byte; penanda akhir dump diverifikasi. Jumlah record database sebelum/sesudah pergantian runtime sama. Health deployment dan HTTPS publik lulus.

## Verifikasi produksi

- 16.38.51 WIB: 47 online di database dan 47 koneksi aktif di worker; tidak ada selisih dua arah. Empat perangkat target terhubung, worker aktif, dan sudah ada pengiriman setelah restart.
- TSM Makassar mengalami kegagalan penutupan auth lagi pada 16.40.42. Recovery berikutnya berhasil membuka koneksi pada 16.41.09, sekitar 27 detik kemudian. Ini merupakan bukti produksi bahwa kegagalan penutupan tidak lagi membuat recovery macet permanen. Pemicu awal gangguan database sendiri belum diselesaikan oleh patch ini.
- 16.42.54 WIB: 46 online di database dan 46 di worker, keempat target terhubung, 10 dispatch memiliki `sentAt` sejak restart.
- 16.43.26 WIB: 47 online di database dan 47 di worker, keempat target tetap terhubung, 11 dispatch memiliki `sentAt` sejak restart. Tidak ada online palsu ataupun socket aktif dengan status database offline pada kedua snapshot akhir. Poll terakhir berusia sekitar 1,5 detik.
- HTTPS publik `/signin`: HTTP 200. Checksum delapan source/helper/regresi yang dipromosikan sesuai manifest.
- Peringatan terakhir `SENDER_OFFLINE_WITH_BACKLOG` masih ada untuk perangkat lain yang offline; ini bukan klaim seluruh nomor terdaftar sudah terhubung. Peringatan backlog/offline yang telah diizinkan tidak menghalangi worker aktif.

Bukti agregat tanpa token atau isi pesan disimpan di backup: `SUCCESS.json`, `prepared.json`, `database-before.json`, `online-verification-first.json`, `online-verification-final.json`, dan `cleanup-manifest.json`.

## Cleanup

Selesai setelah verifikasi path absolut, symlink, proses dan file terbuka, cron, dependensi runtime, serta checksum. Tidak ada referensi aktif ke folder kerja sementara.

- Server: menghapus ZIP patch, helper upload, log pengujian/promosi/backup sementara, dump parsial gagal, staging, dan folder `.doran-work-online-reconnect-20261112`. Symlink `node_modules` staging dilepas tanpa menyentuh dependency produksi.
- Lokal: menghapus ZIP dan inventaris dalam `tmp/online-reconnect-20261112`, serta tiga direktori schema fixture sintetis yang dibuat suite pekerjaan ini. Source perbaikan, regresi, helper deployment, dan laporan dipertahankan.
- Backup pemulihan lengkap di `repos/doran-backups/doran-online-reconnect-1794474267` sengaja dipertahankan. Tidak ada artefak sementara pekerjaan ini yang sengaja ditinggalkan. Artefak lama milik pekerjaan lain tidak dihapus.
