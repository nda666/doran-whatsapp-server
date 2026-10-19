# Pemulihan lokal — 12 Oktober 2026

Konfigurasi produksi `.env` telah disalin byte demi byte ke akar proyek lokal. Snapshot privat berada di `.recovery/20261012T100632Z/`. Nilai rahasia tidak dicetak ke log/chat. `.env`, variasi konfigurasi lokal/produksi, dan `.recovery/` dikecualikan dari Git. Jangan membagikan seluruh folder proyek sebagai arsip publik karena arsip manual tidak mengikuti `.gitignore`.

Snapshot berisi `.env`, `ecosystem.config.js`, seluruh folder `prisma` dari VPS, `database-schema.sql` (struktur tanpa baris data), metadata migration dan manifest SHA-256. Salinan `.env` mempunyai 18 variabel dan semua variabel wajib yang diperiksa tersedia. Bukti: `env-verification.json`, `verification.json`, dan `replay-verification.json` di snapshot privat.

## Hasil verifikasi

- Seluruh 42 file migration lokal identik dengan file VPS, dan `schema.prisma` identik.
- Database produksi mempunyai 24 tabel, 42 migration selesai, dan tidak ada migration menggantung.
- Seluruh 42 migration berhasil diterapkan pada database kosong terisolasi di `127.0.0.1:33179/doran_recovery_test`.
- Snapshot struktur produksi juga berhasil diimpor ke database uji terpisah. Perbandingan menemukan dua perubahan lama yang tidak tercatat dalam migration: `inbox_messages.retry` dan `inbox_messages.sentAt` nullable tanpa default.
- SQL pelengkap `prisma/recovery/align-with-production-20261012.sql` diterapkan setelah migration pada database baru. Perbandingan Prisma kemudian menunjukkan tidak ada perbedaan struktur dengan snapshot produksi.
- Pengujian menggunakan MariaDB 11.6.2 lokal; database produksi MySQL 8.0.45. Replay pada MySQL 8.0.45 baru belum diuji. SQL struktur asli MySQL tetap disimpan sebagai rujukan.
- Satu checksum riwayat lama (`20231107042533_alter_add_status_column_inbox_messages`) berbeda dari file yang tersedia, walaupun salinan lokal/VPS identik. Riwayat produksi dan file migration lama tidak diubah. Replay kosong tetap berhasil.
- Prisma model lama tidak sepenuhnya menggambarkan struktur produksi; karena itu pemulihan memakai migration **dan** SQL pelengkap. Jangan memakai `prisma db push`/`migrate dev` untuk pemulihan produksi. Laporan perbandingan model disimpan dalam direktori replay privat; perbedaan default TEXT juga dipengaruhi representasi MariaDB/MySQL.

## Deploy ulang dengan database baru

1. Siapkan VPS baru: Node.js, MySQL 8 yang kompatibel, PM2, proxy domain dan HTTPS. Instal dependensi dari `package-lock.json` pada Linux; jangan menyalin `node_modules`/build Windows sebagai runtime Linux.
2. Buat database kosong dan pengguna MySQL dengan nama/kredensial sesuai salinan `.env`, atau sesuaikan `.env` untuk VPS baru. URL database `localhost` mengacu pada mesin tempat aplikasi dijalankan. Sesuaikan path Node dalam `ecosystem.config.js` dengan VPS baru.
3. Pastikan WhatsApp dan dispatch tidak berjalan selama pemulihan. Jangan memulai PM2 sebelum database dan storage siap; konfigurasi ecosystem mengaktifkan WhatsApp/dispatch.
4. Jalankan dari akar proyek, **hanya pada database baru kosong yang telah diperiksa tujuan koneksinya**:

   ```sh
   npx prisma migrate deploy
   npx prisma db execute --file prisma/recovery/align-with-production-20261012.sql --schema prisma/schema.prisma
   npx prisma generate
   WHATSAPP_ENABLED=false DISPATCH_QUEUE_ENABLED=false QUEUE_ENABLED=false npm run build
   ```

5. Pulihkan data pengguna dan storage dari backup terpisah jika tersedia. Setelah konfigurasi dan data siap, jalankan aplikasi dengan PM2 dan periksa domain/HTTPS.

SQL pelengkap khusus untuk database baru hasil replay 42 migration; jangan dijalankan pada produksi yang sudah mempunyai kolom tersebut. `database-schema.sql` adalah snapshot struktur alternatif/rujukan, bukan dump data atau riwayat migration: jangan mengimpornya lalu menjalankan semua migration di database yang sama karena tabel akan dibuat dua kali. Untuk restore backup database lengkap, jangan gunakan SQL pelengkap ini tanpa pemeriksaan struktur.

Snapshot ini tidak berisi baris database, media produksi, atau sesi WhatsApp. Akun dan data lama memerlukan backup data terpisah; tanpa sesi WhatsApp, perangkat harus dipasangkan ulang. Rahasia webhook yang disimpan sebagai baris database juga memerlukan backup data, bukan `.env`.

## Memperbarui pemeriksaan

`python deployment/backup-recovery-local.py` membuat snapshot baca-saja baru melalui SSH, tanpa mengubah VPS. Bila `.env` lokal berbeda, script mempertahankannya dan mencatat konflik; salinan produksi tetap tersedia di snapshot baru. Script tidak memperbaiki atau menimpa migration lokal secara otomatis.

`python deployment/verify-recovery-local.py` menguji snapshot terbaru memakai MariaDB lokal sementara, menolak port uji yang sudah terpakai, dan menghentikan server uji setelah selesai. Runtime MariaDB saat ini berada di `D:/laragon/bin/mysql/mariadb-11.6.2-winx64/bin`. Jangan arahkan script ini ke database produksi. Isi laporan harus diperiksa; kecocokan dengan produksi mensyaratkan `recovery_matches_production: true`.

Tidak ada deploy, perubahan database produksi, restart aplikasi, atau pengiriman WhatsApp dalam pekerjaan backup/verifikasi ini.
