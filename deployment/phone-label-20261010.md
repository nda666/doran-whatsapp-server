Deployed 10 Oktober 2026 ke https://dashboard.jeblast.com/dashboard/phone.

Kolom Nama menjadi Label; Nama akun menjadi Nama Akun WA. Form tambah/edit dan validasi memakai Label. Pencarian memakai Label / Nama Akun WA dan placeholder yang sesuai. Informasi sesi dan dokumentasi API memakai istilah yang sama. Semua locale memiliki key phone_label; name untuk pengguna/kontak tetap sesuai konteks. Field database dan API tetap name/account_name.

Verifikasi: TypeScript dan ESLint tanpa error (warning hook yang sudah ada); build produksi berhasil; label tabel dan pencarian diperiksa pada HTML live terautentikasi; delapan halaman dan 13 API lolos pemeriksaan read-only. Semua hash source cocok. Telegram PID tidak berubah; konfigurasi WhatsApp/dispatch dipertahankan.

Backup: /home/jeblast/backups/doran-phone-label-20261010. Deployment memeriksa build ID dan hash source untuk menghindari menimpa perubahan bersamaan, dengan rollback otomatis.
