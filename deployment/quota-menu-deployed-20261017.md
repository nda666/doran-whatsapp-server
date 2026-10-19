# Menu pesan dan kuota harian — 17 Oktober 2026

- Pengaturan pesan/notifikasi dipindah ke Administrasi → Pesan dan notifikasi.
- Tambah/impor dan pengelolaan daftar blokir dipindah ke Phonebook/Kontak → Daftar blokir.
- Menu sidebar Pengaturan pesan dihapus; URL lama mengalihkan ke tab Administrasi.
- Kuota harian awal seluruh nomor diubah menjadi 200 dengan migrasi `20261017050000_global_device_quota`. Penggunaan hari ini tidak direset.
- Setting `device-daily-quota` pada Administrasi → Pengaturan Global berlaku untuk seluruh nomor yang mengikuti global.
- Setiap nomor memiliki pilihan Gunakan kuota global atau kuota custom pada Kesehatan perangkat → Atur batas. Nilai custom disimpan saat beralih ke global.
- Pengiriman menerapkan nilai global terkini pada percobaan berikutnya tanpa restart. Pemanasan, jeda dan penghentian adaptif tetap berlaku.

Validasi: TypeScript, lint file terkait, behavioral tests (termasuk percobaan ke-201 dan custom), regression campaign, production build, backup database, migration deploy, uji konkurensi MySQL dan startup candidate berhasil. Script `verify-quota-menu-live.cjs` memeriksa inisialisasi 200, validasi input, round trip global/custom melalui perangkat sintetis, autentikasi, halaman dan redirect URL lama. Perangkat sintetis dibersihkan; tidak ada pesan WhatsApp/email uji yang dikirim.

Browser: tab Pesan dan notifikasi, tab Daftar blokir, tabel kuota 200 dan switch global/custom diperiksa. Form global 200 berhasil disimpan.

Deploy memakai staging terisolasi dan backup sebelum promosi. Rincian runtime terakhir tercatat di `quota-menu-deploy-20261017.log`.
