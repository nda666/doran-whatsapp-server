# Pendaftaran minimal 6 karakter

Aktif pada 12 Oktober 2026 di https://dashboard.jeblast.com.

Build: `qiexs7Cgt-bdtgShTxbKy`.
Backup: `/home/jeblast/backups/doran-signup-password-1791785815`.

Form dan API pendaftaran menerima kata sandi minimal 6 karakter. Pesan validasi memakai `common.validation.min` sehingga muncul teks Indonesia, bukan key `min`. Batas maksimal serta konfirmasi dan persetujuan admin dipertahankan.

Build produksi Linux dan pemeriksaan schema lolos. Verifikasi localhost serta domain HTTPS memeriksa halaman, browser bundle minimal 6, penolakan 5 karakter (400), dan kelolosan 6 karakter ke pemeriksaan email administrator (409). Verifikasi memakai email administrator yang dicadangkan sehingga tidak membuat akun baru. PM2 aplikasi online, flag WhatsApp/dispatch dipertahankan dan PID Telegram tetap sama. Hash source sesuai manifest.
