# Pengaturan global dan reset password

Menu: Admin Panel → Pengaturan Global. Label bisa diedit; key berupa slug yang unik dan tidak dapat diubah. Value diperlakukan sebagai teks, dibersihkan dari karakter kontrol, dirender sebagai teks, dan dienkripsi AES-256-GCM di database. Konsumen setting harus tetap memvalidasi tipe/format sesuai penggunaannya. Hanya administrator utama yang dapat membaca atau menulis setting.

## Penerapan

1. Salin kode dan migration baru, kemudian jalankan `npx prisma migrate deploy` dan `npx prisma generate`.
2. Siapkan `SETTINGS_ENCRYPTION_KEY` yang stabil dan rahasia pada environment server, serta `POSTMARK_SERVER_TOKEN` untuk inisialisasi. Token yang diberikan pengguna hanya disimpan dalam `.env` lokal yang diabaikan Git. Jangan memasukkan file tersebut ke arsip kode atau repository.
3. Jalankan `node deployment/initialize-postmark-setting.cjs`. Ini membuat setting `postmark-server-token` dalam bentuk terenkripsi dan mempertahankan setting yang sudah ada. Runtime membaca token dari tabel setting, sehingga perubahan melalui menu langsung berlaku.
4. Pastikan `NEXTAUTH_URL=https://dashboard.jeblast.com` dan sender `wa@dorandev.com`, stream `outbound`, serta stream `broadcast` tersedia pada server Postmark.
5. Build dan restart aplikasi. Periksa login → Lupa password → email reset → password baru → login.

Simpan encryption key bersama backup database. Mengganti encryption key tanpa mengenkripsi ulang seluruh setting membuat data lama tidak dapat dibaca. Jangan memakai `NEXT_PUBLIC_` untuk token atau encryption key. Bila `SETTINGS_ENCRYPTION_KEY` belum tersedia, kode memakai `NEXTAUTH_SECRET` sebagai fallback; pertahankan key yang digunakan sejak awal.

Jika aplikasi berada di belakang reverse proxy yang mengganti header `X-Forwarded-For`, aktifkan `AUTH_TRUST_PROXY=true` agar pembatasan permintaan memakai IP klien. Default memakai alamat socket.

## Perilaku reset

- Tautan berlaku 30 menit, token acak 256 bit, hanya hash token tersimpan di database. Token dalam fragment URL dan dihapus dari address bar setelah reset berhasil agar tetap tersedia selama hydration/remount halaman.
- Respons email aktif/tidak terdaftar sama. Akun tidak aktif/belum disetujui tidak mendapatkan email.
- Pembatasan permintaan tersimpan di database, berlaku lintas proses/restart: 20 permintaan per IP/15 menit, maksimal 3 email per akun/15 menit; reset maksimal 30 percobaan per IP/15 menit.
- Postmark dipanggil dengan stream bergantian: outbound, broadcast, outbound, dan seterusnya. Penghitung atomik disimpan di database; percobaan kirim yang gagal tetap mengonsumsi giliran. Tidak mengulang otomatis agar tidak mengirim email ganda ketika hasil jaringan tidak pasti.
- Reset sukses membatalkan semua tautan reset akun dan sesi login sebelumnya. Token API user/device tetap berlaku.
- Tautan tidak dapat digunakan setelah email/password/sessionVersion akun berubah.
- Pengiriman email produksi belum dibuktikan oleh tes otomatis. Tes menggunakan transport tiruan dan tidak mengirim pesan kepada pengguna.

## Pemeriksaan lokal

`node deployment/verify-global-settings-password-reset.cjs`

Pemeriksaan tipe menggunakan `node node_modules/typescript/bin/tsc -p tmp/tsconfig.profile-check.json --pretty false`. Konfigurasi itu hanya memeriksa sumber aplikasi agar salinan lama dalam `tmp` tidak ikut dikompilasi.
