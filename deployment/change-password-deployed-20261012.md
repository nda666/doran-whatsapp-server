# Ganti password pengguna login

Aktif 12 Oktober 2026, build `v1m35DoV8eK3cEUqkPoRL`.

URL: https://dashboard.jeblast.com/dashboard/change-password. Menu dropdown nama user → Ganti password.

Backup VPS: `/home/jeblast/backups/doran-change-password-1791821559`.

Form: password saat ini, password baru minimal 6 karakter, dan konfirmasi. API hanya mengubah akun pengguna terautentikasi dan mewajibkan password saat ini cocok. Password baru harus berbeda. Validasi 72 byte mengikuti bcrypt; password tidak di-trim. Pembatasan maksimal 10 percobaan per akun per 15 menit disimpan pada tabel auth_rate_limits yang sudah ada.

Transaksi mengunci user dan memeriksa ulang password/sessionVersion/status akun untuk menolak perubahan bersamaan atau sesi stale. Perubahan sukses menaikkan sessionVersion, menghapus sesi dan tautan reset lama, serta memutus socket akun. UI logout dan meminta login dengan password baru. Token API user/device dipertahankan.

Lint, TypeScript sumber aplikasi, tes negatif/konkurensi, build produksi, dan tes live lulus. Live menggunakan akun sementara; memastikan akses terautentikasi, password saat ini/konfirmasi/panjang valid, sesi lama ditolak, dan login password baru berhasil. Akun uji dihapus. Tampilan halaman diverifikasi pada browser tanpa mengubah password pengguna asli. Tidak membutuhkan migrasi database baru.
