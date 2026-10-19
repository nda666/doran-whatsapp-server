# Deployment pengaturan global, profil/token user, dan reset password

Status: aktif di https://dashboard.jeblast.com pada 12 Oktober 2026.

Build ID: `tovIlFdW8Nv1-socmptto`.

Backup privat VPS: `/home/jeblast/backups/doran-global-settings-reset-1791818627` (database, environment, source sebelum perubahan, runtime lama, dan log build).

Migration: `20261012170000_global_settings_password_reset`, berhasil diterapkan. Setting `postmark-server-token` telah diinisialisasi terenkripsi. Konfigurasi rahasia dikirim setelah pengguna memberi izin eksplisit untuk VPS Jeblast; file transfer privat di VPS telah dihapus oleh skrip aktivasi.

Fitur aktif:

- Navbar → Edit profil / Token user / Keluar.
- Admin Panel → Manage Users → kolom Token user.
- Admin Panel → Pengaturan Global: https://dashboard.jeblast.com/dashboard/admin?tab=global-settings.
- Login → Lupa password: https://dashboard.jeblast.com/forgot-password.

Verifikasi:

- Build produksi Next.js + TypeScript server berhasil pada staging terisolasi.
- Tes profil, akses token admin, pembatasan super admin, pengaturan global, dan reset password lulus.
- Live: halaman publik, setting terenkripsi/slug/key permanen, pemisahan akses user/admin, profil/token user, reset bersamaan yang hanya diterima sekali, password baru dapat login, password lama dan sesi lama ditolak, serta cleanup akun/setting sementara.
- Postmark: GET `/server`, `/message-streams/outbound`, dan `/message-streams/broadcast` berhasil dengan konfigurasi privat. Tidak ada email dikirim kepada pengguna dalam pengujian. Keberhasilan delivery email belum dikonfirmasi.
- PM2 doran-whatsapp online; flag WhatsApp dan dispatch tetap aktif. PID telegram-sender tidak berubah.

Aktivasi pertama otomatis rollback karena tes mengharapkan teks menu admin di HTML sebelum sesi client dimuat. Verifier diperbaiki untuk memeriksa bundle halaman. Aktivasi ulang lulus seluruh tes; backup database awal dipertahankan. Tidak ada perubahan kode aplikasi pada percobaan ulang ini.
