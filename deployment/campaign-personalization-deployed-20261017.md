# Personalisasi campaign — deploy 17 Oktober 2026 (WIB)

Status: berhasil aktif di https://dashboard.jeblast.com/dashboard/campaigns.

- Build aktif: `dIp0oXfqlqPui51WKIyEO`.
- Paket: `deployment/campaign-personalization-20261017.zip`, 9 file dengan manifest SHA-256 dan pemeriksaan baseline produksi sebelum promosi.
- Backup versi sebelumnya: `/home/jeblast/backups/doran-campaign-personalization-1792171327`.
- Log lokal: `deployment/campaign-personalization-deploy-20261017.log`.
- Tidak memerlukan migrasi database.

Paket khusus personalisasi dibuat berdasarkan source produksi. Perubahan stiker pada file lokal bersama tetap dipertahankan di workspace dan tidak disertakan dalam deploy ini. Source create campaign produksi sudah menyimpan `recipients` ke JSON audience; tidak perlu diganti. Route edit memperoleh batas body 3 MB.

## Verifikasi

- Tes sintetis personalisasi pada source staging: lulus, termasuk parser baris CSV/Excel, penggantian placeholder, validasi/batas data, round-trip edit, create/edit dengan repository tiruan, serta SSR komponen. Tes stiker dilewati pada paket ini karena fitur tersebut belum disertakan.
- Build Next.js dan TypeScript di staging: lulus.
- Staging HTTP terisolasi tanpa koneksi WhatsApp: halaman campaign dengan autentikasi, aset JavaScript, template CSV, API baca campaign, penolakan schema sebelum antrean, serta helper personalisasi hasil kompilasi: lulus.
- Pemeriksaan yang sama setelah promosi pada domain produksi: lulus; build halaman cocok dengan build aktif.
- Proses PM2 aplikasi online, WhatsApp dan antrean tetap aktif, PID layanan Telegram tidak berubah.
- Hash source aktif cocok dengan manifest paket.
- Folder staging sudah dibersihkan; backup versi sebelum deploy dipertahankan sesuai kebijakan retensi.

Verifikasi tidak membuat campaign maupun mengirim pesan WhatsApp. Upload Excel dan interaksi browser end-to-end belum diuji; data sel Excel diuji pada parser, dan halaman/aset diverifikasi melalui HTTP berautentikasi.
