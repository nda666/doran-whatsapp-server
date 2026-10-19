# Perbaikan bahasa JeBlast — 17 Oktober 2026

Aktif: https://dashboard.jeblast.com/dashboard

Build produksi: `W0ih9JEGGOiLeRmTk8qB7`

Backup: `/home/jeblast/backups/doran-localization-1792217166`

## Perubahan

- Kamus 2.490 teks tersedia dalam Indonesia, Inggris, Spanyol, Arab, dan Hindi.
- Menu, judul halaman, dasbor, formulir, dialog, notifikasi, status perangkat/pengiriman, dan penjelasan API dihubungkan ke kamus.
- Terjemahan lama diikat ke bahasa rute untuk menghindari perbedaan bahasa saat prerender/hidrasi.
- Pemilih bahasa bersama pada dasbor dan halaman tamu; pilihan tersimpan dalam cookie NEXT_LOCALE. Bahasa dipertahankan pada pengalihan autentikasi.
- Locale komponen Ant Design dan angka mengikuti pilihan bahasa; bahasa Arab memakai arah RTL. Blok contoh kode tetap LTR.
- Nilai formulir, nama pengguna/kontak, isi pesan, token, parameter teknis, dan contoh payload API tidak diterjemahkan.
- Tidak ada panggilan layanan terjemahan saat aplikasi digunakan. Kamus dibundel lokal.

## Validasi

- TypeScript lulus; build produksi server terisolasi lulus. Lint tidak memiliki error; peringatan dependency hook lama tetap tercatat pada build.
- Verifikasi kamus: 2.490 teks × 5 bahasa, kesamaan kunci, placeholder, pola pesan server, isolasi locale, dan nilai field formulir lulus.
- Browser staging menggunakan sesi/data sintetis, tanpa JWT admin atau data akun nyata: 80 kombinasi halaman/bahasa lulus tanpa error halaman atau teks sumber yang tertinggal pada pemeriksaan. Pengujian ulang 15 kombinasi halaman yang terkait perubahan terakhir juga lulus.
- Pergantian Inggris → Spanyol mempertahankan isian profil yang belum disimpan dan query rute; cookie bahasa tersimpan. Tampilan Arab 390px diperiksa setelah sidebar selesai menutup.
- Browser produksi tanpa login: kelima bahasa, atribut lang/dir, judul login, pengalihan halaman terproteksi, dan pilihan bahasa setelah reload lulus tanpa error halaman.
- Pemasangan memverifikasi baseline/hash, startup, status PM2, pengaktifan WhatsApp dan antrean, serta PID Telegram tetap sama. Backup runtime dan source dipertahankan. Tiga staging lama milik tugas ini dibersihkan.

## Bukti

- `deployment/localization-prepare-20261017.log`
- `deployment/localization-promote-20261017.log`
- `tmp/localization/browser-preview-full.json`
- `tmp/localization/browser-preview.json`
- `tmp/localization/browser-public-live.json`
- `output/localization-spanish-form.png`
- `output/localization-arabic-mobile.png`
- `output/localization-live-signin-spanish.png`

Pengujian halaman akun dilakukan pada fixture sintetis; sesi admin nyata tidak dibuat atau diekstrak. Berkas unduhan laporan/PDF dan isi pesan tersimpan mengikuti data aslinya.
