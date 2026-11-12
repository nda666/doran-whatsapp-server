# Aturan kerja proyek

## Lokasi seluruh pekerjaan WA server

- Mulai sekarang, semua pekerjaan baru untuk aplikasi WA server menggunakan
  `/home/jeblast/repos` sebagai direktori induk di server: source, script,
  deployment, pengujian, audit, paket upload, log khusus pekerjaan, laporan,
  state, dan backup baru khusus pekerjaan WA server.
- Checkout aplikasi tetap di `/home/jeblast/repos/doran-whatsapp-server`.
  Gunakan `/home/jeblast/repos/.doran-work-<id-pekerjaan>/` untuk pekerjaan
  sementara, `.doran-incoming-<commit>/` untuk upload CI/CD, serta subfolder
  khusus di dalam `repos` untuk kebutuhan operasional baru. Jangan membuat file
  atau direktori kerja WA server baru langsung di `/home/jeblast`.
- Perubahan script dan konfigurasi baru wajib memeriksa path absolut/relatif,
  working directory, cron, startup, dependensi, log, dan output agar memakai
  lokasi di dalam `repos`. Aturan ini berlaku untuk semua ekstensi file.
- Komponen operasional lama di luar `repos` yang masih dipakai (runtime Node,
  PM2 bersama aplikasi lain, startup, proxy cPanel, state maintenance, dan backup
  pemulihan) tetap berfungsi sampai dimigrasikan secara terencana. Saat memindah
  komponen tersebut, audit pemakaian bersama dan dependensinya, perbarui seluruh
  referensi, siapkan rollback, dan verifikasi aplikasi sebelum/sesudah. Jangan
  mengganggu aplikasi lain atau memindahkan file sistem/cPanel yang lokasinya
  ditentukan platform hanya untuk memenuhi aturan direktori kerja ini.

## Pembersihan setelah pekerjaan selesai

- Setiap deployment, pengujian, audit, atau perbaikan harus diakhiri dengan
  pembersihan file sementara yang dibuat atau diunggah untuk pekerjaan tersebut,
  termasuk ZIP/TAR, log sementara, script Python sekali pakai, dan cache Python.
  Aturan ini berlaku di workspace lokal maupun server `/home/jeblast`.
- Catat daftar file sementara sejak awal pekerjaan. Di server, tempatkan ZIP/TAR,
  log sementara, script Python sekali pakai, dan cache dalam satu direktori khusus
  `/home/jeblast/repos/.doran-work-<id-pekerjaan>/`. Jangan menaruh file baru
  tersebut langsung di `/home/jeblast` atau di checkout aplikasi produksi.
  Di workspace lokal, gunakan folder `tmp/` khusus pekerjaan.
- Setelah proses selesai dan hasilnya diverifikasi, hapus file pada daftar
  tersebut yang sudah tidak diperlukan. Pengguna telah mengizinkan cleanup rutin
  dalam lingkup ini; tidak perlu meminta persetujuan ulang untuk setiap file.
- Untuk deployment GitHub Actions, hapus hanya folder
  `/home/jeblast/repos/.doran-incoming-<commit>` milik deployment tersebut setelah
  deployment dan pemeriksaan HTTPS publik berhasil.
- Otomatisasi server: `/home/jeblast/repos/doran-ops/artifact-maintenance.py`
  dijadwalkan setiap 15 menit melalui cron. Incoming hanya dihapus jika checksum
  cocok dengan `SUCCESS.json` deployment, backup runtime/database tersedia,
  upload tidak aktif, dan tidak ada file asing atau symlink. Upload yang baru
  berubah kurang dari lima menit dipertahankan. Incoming lama di home tanpa
  bukti sukses dipindahkan ke `repos` dan tetap disimpan untuk diagnosis.
- Agar cleanup pekerjaan baru dapat otomatis, buat `artifact-manifest.json` di
  `.doran-work-<id-pekerjaan>` dengan `version: 1`, `state: "completed"`, dan
  `files: [{"name": "nama-file-sementara.py", "sha256": "checksum-file"}]` hanya
  setelah pekerjaan dan pemeriksaan keamanan selesai. Daftarkan file sementara
  saja; nama harus langsung di folder pekerjaan. Checksum, referensi kode/cron,
  dan proses aktif diperiksa ulang sebelum penghapusan. File tanpa manifest,
  manifest gagal/belum selesai, dan arsip legacy dipertahankan.
- Sebelum menghapus, verifikasi path absolut berada di direktori yang dimaksud,
  bukan symlink, serta tidak dipakai proses aktif, cron, startup, atau dependensi
  script yang masih dipertahankan. Jangan menghapus berdasarkan ekstensi saja
  atau memakai wildcard seluruh `/home/jeblast`.
- Pemeriksaan keamanan wajib dilakukan sebelum setiap cleanup, termasuk file
  yang dibuat sendiri. Tidak adanya proses aktif saja belum membuktikan file
  tidak diperlukan. Jika fungsi, dependensi, atau kebutuhan pemulihannya belum
  jelas, jangan hapus; simpan file dan laporkan ketidakpastiannya kepada pengguna.
- Pertahankan source yang dilacak Git, script operasional aplikasi, helper yang
  masih dipakai, konfigurasi, kredensial, database, sesi WhatsApp, upload pengguna,
  log aktif, dan backup pemulihan. Log aplikasi hanya dibersihkan melalui retensi
  atau rotasi yang sudah disetujui, bukan aturan file sementara ini.
- Jika pekerjaan gagal atau rollback belum terverifikasi, pertahankan file dan
  log yang diperlukan untuk diagnosis/pemulihan. Setelah masalah selesai,
  bersihkan sisa file sementara yang tidak lagi diperlukan.
- File lama di luar pekerjaan saat ini harus diaudit dan ditentukan daftarnya
  sebelum penghapusan. Jangan menganggap semua ZIP, log, atau Python lama aman.
- Saat melaporkan hasil, sebutkan cleanup yang dilakukan dan file sementara yang
  sengaja dipertahankan beserta alasannya, jika ada.
