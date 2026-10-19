# Test Kirim — 12 Oktober 2026

Aktif di https://dashboard.jeblast.com/dashboard/phone (juga route /en/dashboard/phone).
Build: `moJPTFZ-S-PYEaz1_hiMk`.
Backup: `/home/jeblast/backups/doran-test-send-types-1791743502`.

Menambahkan 11 tipe: teks, gambar, video, audio, dokumen, sticker WebP, button, list, polling, lokasi, kontak/vCard. Form kondisional menyediakan caption, pilihan File Manager sesuai MIME, 1–3 tombol, 1–10 baris daftar, 2–12 opsi polling, jumlah jawaban, koordinat, dan nama/nomor kontak. Dropdown media menggunakan API GET yang memeriksa akses perangkat dan hanya menampilkan media pemilik perangkat. Pengiriman nonteks memakai antrean dispatch dan worker yang sudah ada, tanpa migrasi database. Pengiriman teks lama tetap kompatibel, termasuk direct send saat antrean dinonaktifkan. Tampilan button/list bergantung pada client WhatsApp dan dijelaskan di modal.

Validasi: TypeScript seluruh src, ESLint file perubahan, uji tiruan 11 tipe dan payload antrean, penolakan kepemilikan media salah/MIME salah, polling tidak valid, nomor tidak valid, akses perangkat, perangkat offline/nonaktif, antrean nonaktif dan kompatibilitas teks. Build produksi Next/server terisolasi lulus. Verifikasi live bundle dan API GET media sesuai kepemilikan lulus. Browser produksi memverifikasi dropdown, form button, polling, lokasi, kontak dan gambar serta footer modal yang tetap terlihat pada viewport pengguna. Bukti tampilan: output/test-send-types-live.png.

Tidak ada pesan WhatsApp atau webhook pelanggan dikirim dalam verifikasi. Telegram PID dan flag WhatsApp/dispatch produksi dipertahankan oleh skrip deployment. Pengguna menyetujui upload paket source dan skrip ke jeblast@103.196.146.186 setelah penolakan awal automatic approval review.
