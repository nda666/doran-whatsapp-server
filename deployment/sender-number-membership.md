# Keanggotaan grup berdasarkan nomor WhatsApp

Satu nomor WhatsApp hanya boleh berada dalam satu grup pengirim, termasuk grup
nonaktif dan grup milik akun lain. Beberapa perangkat dengan nomor sama dalam
grup yang sama tetap diperbolehkan. Angka 08…, 628…, +628… dan ID sesi WhatsApp
dibandingkan dalam format internasional yang sama; kode negara selain Indonesia
tetap dipertahankan.

API pengelolaan grup mengembalikan HTTP 409 beserta nomor, nama perangkat dan
grup yang sudah menggunakannya. Penghapusan anggota atau grup membebaskan nomor
untuk dipindahkan. Perangkat tanpa nomor masih dapat dimasukkan sebelum pairing.
Kedua jalur pencatatan nomor (pemulihan sesi dan koneksi terbuka) melewati
updateDevice. Bila nomor yang terungkap bertabrakan dengan grup lain, nomor asli
tetap disimpan dan perangkat yang sedang diperbarui dilepas dari grupnya dengan
prioritas direset. Perubahan keanggotaan juga disertakan dalam webhook perangkat.

Penyimpanan grup dan pembaruan nomor memakai mutex transaksi yang sama dengan
perubahan perangkat: singleton device_webhook_settings. INSERT ON DUPLICATE KEY
UPDATE mengambil kunci eksklusif sebelum membaca keanggotaan; inisialisasi
singleton hanya membuat konfigurasi default nonaktif bila belum ada. Konfigurasi
webhook yang sudah ada dipertahankan. Tidak ada migrasi skema.

GET grup menyediakan audit konflik yang ditampilkan pada dashboard, termasuk
perangkat tanpa grup yang nomornya telah dipakai grup lain. Data konflik lama
tidak dihapus melalui pembacaan ini. Routing grup melewati nomor yang bertabrakan
untuk pesan baru; pengiriman yang sudah memiliki message ID tetap memakai
pengirim semula agar hasil kirim ambigu tidak menimbulkan pengiriman ganda.

Validasi lokal: TypeScript frontend/server, lint sumber terkait, suite regresi
offline, serta integrasi database MariaDB lokal dengan transport WhatsApp tiruan.
Kasus integrasi mencakup format setara, lintas akun, grup nonaktif, koneksi yang
mengungkap nomor duplikat, audit data lama, pemindahan nomor, dua penyimpanan grup
bersamaan, dua pairing bersamaan, routing konflik dan pengirim yang sudah dipin.
Tidak ada pesan WhatsApp nyata yang dikirim. CI/CD main menjalankan ulang suite,
build produksi dan integrasi MySQL 8 sebelum deployment.
