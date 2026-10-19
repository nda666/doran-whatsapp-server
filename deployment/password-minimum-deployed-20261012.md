# Minimum password 6 karakter

Aktif 12 Oktober 2026, build `F7BCcMWTY9J1VV8JjhQGX`.

Backup VPS: `/home/jeblast/backups/doran-password-minimum-1791820353`.

Minimum password akun seragam 6 karakter di UI dan API: registrasi, login, reset password, tambah/edit user oleh admin, dan konfirmasi password saat mengganti email profil. Field password admin yang kosong saat mengedit tetap mempertahankan password lama.

Lint, tes reset dengan password tepat 6 karakter, dan build produksi lulus. Tes live membuktikan admin dapat membuat akun sementara dengan password 6 karakter, reset password 6 karakter berhasil dan dapat dipakai login, sedangkan input 5 karakter ditolak oleh API tambah user dan reset password. Semua data uji dibersihkan. Tidak ada migration atau pengiriman email pengguna dalam deployment ini.
