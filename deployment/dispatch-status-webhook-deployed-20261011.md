# Deployment webhook status antrean

Berhasil diterapkan ke https://dashboard.jeblast.com pada 11 Oktober 2026 (Asia/Jakarta).

Build: `qnBrFQOaa_NSgfmyDu77n`.
Backup: `/home/jeblast/backups/doran-dispatch-status-webhook-1791696374`.
Migration: `20261011130000_dispatch_status_webhook`.

Admin Panel memiliki tab **Webhook Status Pengiriman** dengan satu URL global, kunci, aktivasi, simpan, tes, dan riwayat. Pengaturan produksi diverifikasi `enabled=false`, URL kosong, kunci belum diisi, dan riwayat kosong. Webhook perangkat tetap memakai konfigurasi sebelumnya. WhatsApp dan durable dispatch tetap aktif; PID Telegram dipastikan tidak berubah.

Source produksi dicocokkan dengan baseline sebelum perubahan. Prisma Client digenerate terisolasi; tes webhook status, request-job-id, send-response, webhook perangkat dan full production build lulus. Database dan runtime dicadangkan sebelum migration dan promosi.

Tes nyata MySQL dalam transaksi rollback memverifikasi event QUEUED → PROCESSING → SENT → DELIVERED → READ, previous_status, client job_id, deduplikasi insert dan receipt. Tidak ada job/event tes yang di-commit; konfigurasi webhook kembali identik setelah rollback. Tidak ada tes mengirim pesan WhatsApp atau webhook ke kasir.

Promosi awal otomatis di-rollback karena pemeriksaan label tab pada HTML sebelum hydration. Tab bergantung pada useSession dan dirender sesudah hydration. Pemeriksaan diperbaiki untuk mencocokkan build ID HTML dengan runtime dan memeriksa label/input pada bundle admin yang benar-benar diambil dari produksi. Build aplikasi tidak berubah. Skrip resume menyesuaikan baseline schema/migration tambahan yang tetap tersimpan setelah rollback dan mempromosikan build yang sudah lulus.

Pemeriksaan produksi lulus: GET pengaturan oleh admin, URL kosong/nonaktif, kunci tidak dikembalikan, akses unauthenticated ditolak, akses user biasa ditolak jika tersedia, halaman admin dan bundle baru, delapan halaman dashboard, tiga belas API read-only, pencarian job ID. Semua hash source yang dipromosikan sesuai manifest final. PM2 dashboard online dan konfigurasi proses disimpan.

Skrip: `deployment/deploy-dispatch-status-webhook-20261011.py` dan `deployment/resume-dispatch-status-webhook-20261011.py`. Backup mempertahankan database, source/runtime lama, Prisma Client lama, manifest dan log. Deployment selesai; pengiriman webhook ke kasir baru berlaku setelah URL/kunci diisi dan webhook diaktifkan.
