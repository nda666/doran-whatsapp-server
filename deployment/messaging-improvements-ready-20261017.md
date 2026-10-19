# Pembaruan tujuh fitur Doran WA

Status: implementasi source lokal tersedia. Belum diunggah, dimigrasikan, atau diaktifkan di produksi. Unggahan paket ke server Jeblast ditolak peninjauan persetujuan otomatis karena belum ada izin eksplisit untuk mengirim source ke server tersebut.

## Perubahan

1. Pengaturan pesan per akun: deteksi STOP dan email notifikasi perangkat memiliki sakelar ON/OFF terpisah. Keduanya awalnya OFF. Deteksi STOP berjalan sebelum penyimpanan media/balasan otomatis; webhook pesan masuk tetap berjalan. Identitas LID dipetakan melalui alternate JID atau penyimpanan pemetaan Baileys.
2. Daftar blokir per akun: tambah, cari, impor nomor CSV/TXT, dan hapus setelah konfirmasi persetujuan baru. Pemeriksaan berlaku di pembentukan antrean, worker, dan batas transport bersama. Mematikan deteksi STOP tidak menghapus daftar blokir. Pesan yang sudah diserahkan ke transport tidak dapat ditarik kembali.
3. Email perangkat terputus/tersambung menggunakan token server dan alamat pengirim Postmark yang sudah ada. Default ambang offline 90 detik; pemulihan dikonfirmasi 30 detik; cooldown alert 30 menit per perangkat. Lease database mencegah beberapa worker memproses notifikasi yang sama bersamaan. Timeout sesudah provider menerima email masih dapat menimbulkan pengiriman ulang; tidak ada klaim exactly-once.
4. Pengamanan pengiriman berlaku pada semua panggilan socket: default 500 percobaan per perangkat per hari, interval minimum 5 detik, reset 00.00 WIB. Batas dapat diubah. Reservasi dicatat secara konservatif, termasuk retry, pengiriman grup dan balasan otomatis. Batas baru mulai dihitung setelah rilis, tanpa merekonstruksi percobaan transport lama.
5. Skor operasional memakai kesalahan transport/konfirmasi harian dengan minimal 20 sampel. Error 10% memperlambat interval 3 kali; 30% menghentikan pengiriman sampai evaluasi hari berikutnya atau override admin. Penolakan ACK 463 menjeda perangkat sampai ditinjau admin. Skor ini bukan quality rating resmi WhatsApp atau prediksi banned.
6. Pemanasan dimulai admin, lalu batas naik otomatis setiap dua hari: 25, 50, 100, 200, 350, 500, kemudian batas perangkat. Batas perangkat dan penghentian adaptif tetap berlaku. Tidak ada pesan atau interaksi palsu yang dibuat.
7. Bahasa Indonesia: istilah navigasi, status pengiriman, tombol token, formulir, kata sandi, laporan, dan katalog locale Indonesia diseragamkan. Nama parameter API/kode status tetap kompatibel.
8. Laporan campaign mencakup seluruh pesan campaign, ringkasan receipt, denominator metrik, kegagalan, dan perangkat. Excel memuat detail maksimal 10.000 penerima; PDF memuat ringkasan serta rincian per perangkat. Receipt tidak teramati tidak dianggap gagal.
9. Analytics membandingkan kohort hari ini/kemarin dan minggu ini/minggu lalu dengan durasi berjalan sama dalam WIB. Diagram alasan gagal dan performa perangkat dilengkapi tabel status.
10. Kalender harian, mingguan, bulanan dan agenda: filter perangkat/status, perubahan jadwal dengan optimistic locking, estimasi durasi dan potensi tumpang tindih perangkat. Estimasi bukan reservasi kapasitas; throttling, kuota dan koneksi dapat memperpanjang durasi.
11. Campaign terjadwal tidak kedaluwarsa sebelum jadwalnya hanya karena baris antrean dibuat lebih awal. Riwayat campaign tidak dipotong oleh filter usia laporan global.

## Menu baru

- Pengaturan pesan: `/dashboard/messaging-settings`
- Kesehatan perangkat: `/dashboard/device-health`
- Kalender pengiriman: `/dashboard/calendar`
- Laporan campaign: Kampanye pesan → Aksi → Laporan dan riwayat.
- Perbandingan periode: halaman Dasbor.

## Database dan dependensi

Migrasi: `prisma/migrations/20261017020000_messaging_improvements/migration.sql`.

Menambahkan status SUPPRESSED serta tabel messaging_preferences, recipient_suppressions, device_send_policies, device_daily_usage dan device_alert_states. Tidak menghapus tabel/data existing. Dependensi ekspor: ExcelJS dan PDFKit. Keduanya dijadikan server external packages; PDFKit memerlukan berkas font bawaannya saat runtime.

## Verifikasi

- Prisma validate/generate dan pemeriksaan TypeScript lulus.
- Uji perilaku mencakup opt-out, isolasi akun, kuota, throttling, pause, pergantian tanggal WIB, warm-up, health, debounce/cooldown/flapping/pemulihan Postmark, akses laporan, parsing XLSX, formula sebagai teks, PDF, perubahan jadwal, konflik versi, admission suppression dan campaign terjadwal jauh hari.
- Regresi personalisasi campaign dan filter usia laporan lulus.
- Impor modul notifikasi dari hasil kompilasi server lulus.
- Build Next.js berhasil melewati kompilasi, pembuatan halaman dan penelusuran berkas setelah pembatasan pembacaan berkas pada lingkungan Windows. Peringatan hook yang sudah ada tetap muncul.
- Uji konkurensi MySQL disiapkan dalam verify-messaging-db.cjs, tetapi belum dijalankan karena MySQL lokal tidak tersedia dan migrasi produksi belum diizinkan. Test memakai identitas sintetis dan membersihkan hanya baris yang dibuatnya; tidak mengirim WhatsApp atau email.
- Belum ada pengujian UI yang terautentikasi, pengiriman WhatsApp nyata, atau email Postmark nyata.

## Langkah rilis setelah persetujuan

Paket source: messaging-improvements-20261017.zip. Skrip: deploy-messaging-improvements.py.

Skrip menyiapkan staging dengan node_modules terpisah, memverifikasi baseline source, menjalankan npm ci, Prisma generate, pengujian dan build produksi, membuat backup database, menerapkan migrasi, menguji konkurensi MySQL serta API read-only pada kandidat dengan transport dinonaktifkan, lalu mempromosikan runtime dan memulai ulang hanya proses PM2 doran-whatsapp. Runtime dan source sebelumnya dicadangkan untuk rollback. Konfigurasi .env, storage dan sesi WhatsApp tidak diganti.

Jika runtime harus di-rollback, migrasi tambahan tetap tersimpan. Periksa status SUPPRESSED dan daftar blokir yang dibuat selama jendela rilis sebelum mengoperasikan runtime lama; runtime lama belum memiliki pemeriksaan daftar blokir.

Setelah aktif, buka Pengaturan pesan untuk mengaktifkan STOP dan menentukan email admin serta mengaktifkan notifikasi. Tinjau batas 500 percobaan/hari sebelum melepaskan campaign dengan volume besar.

Build lokal final: `D4G2oIn9kDmNRs60bmh32`. SHA-256 paket source: `71e0f8fc0e1cd1265e64bd657f3d72819be4a268bdc9a0b77a447aad13df0c5f`. Paket 46 berkas diverifikasi terhadap hash source lokal; migrasi diverifikasi terhadap baseline skema server.

Smoke test HTTP localhost lulus: server Next.js produksi berjalan dan keenam API baru mengembalikan 401 tanpa autentikasi. WhatsApp, worker pengiriman dan notifikasi dinonaktifkan selama pengujian. Tidak ada pesan atau email nyata dikirim.
