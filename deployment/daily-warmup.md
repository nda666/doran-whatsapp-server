# Evaluasi pemanasan harian

Server menjalankan evaluasi setiap pukul 00.00 WIB tanpa bergantung pada zona waktu OS.
Per nomor, evaluasi menghitung pengiriman berhasil (`wa_dispatches.sentAt`) pada
masing-masing dua hari kalender sebelumnya: awal hari inklusif, akhir eksklusif.
Antrean yang belum terkirim dan percobaan gagal tidak dihitung.

Nomor dengan `isOnline = false` dan minimal satu pengiriman pada **kedua** hari
diaktifkan pemanasannya. Nomor yang sudah memiliki `warmupStartedAt` dilewati.
Pemeriksaan status dan aktivasi memakai transaksi dengan lock baris nomor;
update bersyarat mempertahankan tanggal pemanasan yang sudah aktif, kuota,
interval, dan pengaturan pause. Evaluasi tidak menyambungkan atau mengirim pesan.

`storage/daily-warmup/latest.json` menyimpan tanggal evaluasi, kedua tanggal
pengiriman, jumlah per nomor, status saat evaluasi, dan hasil keputusan.
Checkpoint ditulis atomik setelah seluruh evaluasi berhasil. Pada startup,
server menunggu 60 detik agar pemulihan koneksi berjalan, kemudian mengevaluasi
hari berjalan jika belum selesai. Ini juga berlaku pada deployment pertama.
Kegagalan dicoba kembali setelah 60 detik. Restart pada hari yang sudah selesai
tidak mengulang evaluasi. File storage tetap dipertahankan oleh CI/CD.

Scheduler mengikuti konfigurasi produksi PM2 yang menjalankan satu instance
server. Scheduler tidak berjalan ketika WhatsApp dinonaktifkan, termasuk server
staging CI/CD. Tidak ada migrasi atau perubahan skema database.

Validasi: `node deployment/verify-daily-warmup.cjs` mencakup batas tengah malam WIB,
pergantian tahun, dua hari wajib terisi, pengecualian nomor online/pemanasan aktif,
pelestarian kuota/pause, checkpoint restart, retry kegagalan, dan shutdown.
Tes termasuk dalam suite offline GitHub Actions.
