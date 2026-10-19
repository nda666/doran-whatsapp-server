# Perbaikan logout navbar

Aktif 12 Oktober 2026, build `K_yrnVZaPTk60jlqTk6qA`.

Backup VPS: `/home/jeblast/backups/doran-navbar-logout-1791819963`.

Menu Keluar langsung menjalankan `signOut` NextAuth dengan tujuan `/signin`, tanpa navigasi melalui `/signout` terlebih dahulu. Klik ganda dibatasi; kegagalan menampilkan pesan dan mengizinkan retry. Halaman `/signout` tetap didukung dan juga menuju `/signin` setelah logout, dengan perlindungan permintaan ganda dan opsi retry.

Pemeriksaan lokal: lint dan tes aksi navbar langsung, pencegahan duplikasi, serta retry. Build produksi dan verifikasi live lulus. Tes live memakai cookie jar autentikasi terpisah untuk membuktikan logout POST dengan CSRF menghapus cookie sesi, respons session tidak memiliki user, dan dashboard diarahkan ke login. Pemeriksaan browser juga memastikan akses dashboard setelah logout kembali ke login. Tidak ada perubahan token API user/device atau sessionVersion akun.
