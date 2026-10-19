# Fitur stiker — deploy 17 Oktober 2026 (WIB)

Status: berhasil aktif di https://dashboard.jeblast.com.

- Build aktif: `JHvYHTOf1UXOrUVPjxJwC`.
- Paket: `deployment/sticker-20261017.zip`, 17 file dengan manifest SHA-256 dan pemeriksaan baseline produksi.
- Backup versi sebelumnya: `/home/jeblast/backups/doran-sticker-1792171602`.
- Log: `deployment/sticker-deploy-20261017.log`.
- Tidak ada migrasi database. Sharp 0.35.5 yang sudah terpasang di server diperiksa sebelum build; kini tercatat sebagai dependensi langsung.

Fitur tersedia di Campaign / Blast, File Manager, dan Test Kirim. Test Kirim
memiliki tombol unggah foto menjadi stiker, pratinjau, pemilihan hasil otomatis,
dan penguncian tombol kirim selama konversi. Unggahan dari Test Kirim disimpan
atas nama pemilik perangkat, termasuk saat admin menguji perangkat pengguna lain.
Personalisasi campaign yang sebelumnya sudah aktif dipertahankan.

## Verifikasi

- Tes konversi, batas ukuran, transparansi, rotasi EXIF, penolakan gambar rusak/animasi, dan kompatibilitas antrean: lulus.
- Tes multipart, pembersihan file, kegagalan penyimpanan, dan pembatasan pemilik perangkat: lulus.
- Tes personalisasi campaign dan kompatibilitas stiker: lulus.
- Build Next.js dan TypeScript di staging Linux terisolasi: lulus.
- Uji HTTP berautentikasi di staging dan domain produksi: halaman Perangkat/Campaign/File Manager dan aset JavaScript cocok dengan build aktif; unggah JPEG menghasilkan WebP 512 × 512 <=100 KB; kepemilikan hasil benar; pratinjau terbaca; hasil muncul pada daftar media Test Kirim; payload stiker hasil kompilasi benar.
- File uji dan catatan media dibersihkan kembali. Tidak membuat campaign atau mengirim pesan WhatsApp.
- PM2 `doran-whatsapp` online dengan WhatsApp dan antrean aktif; PID Telegram tetap sama.
- Hash source aktif cocok dengan manifest; staging dibersihkan dan backup versi sebelumnya dipertahankan sesuai prosedur retensi.

Interaksi browser dan penerimaan stiker di HP belum diuji langsung.
