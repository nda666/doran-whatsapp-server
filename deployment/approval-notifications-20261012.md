# Notifikasi persetujuan user — aktif di produksi

12 Oktober 2026, Asia/Jakarta.

Ikon lonceng navbar khusus super admin menampilkan jumlah akun PENDING. Popover menautkan ke `/dashboard/admin?tab=users&status=PENDING`; tab Manage Users, filter status, pencarian dan pagination direset. Jumlah dipoll setiap 30 detik, saat halaman kembali fokus, saat lonceng dibuka, dan setelah persetujuan/penolakan berhasil. Daftar pending juga dipoll setiap 30 detik. API hanya mengembalikan jumlah dan memakai middleware super admin serta Cache-Control no-store.

Verifikasi: TypeScript dashboard, ESLint file yang berubah, pengujian count/badge/link/loading/error, regresi autentikasi dan pembatasan super admin, dan build produksi Next + TypeScript server di staging Linux lolos.

Paket: `deployment/approval-notifications-20261012.zip`.
Build produksi: `9TlIYZepiwSVqGOlmMshd`.
Backup source/runtime: `/home/jeblast/backups/doran-approval-notifications-1791788002`.

Deployment disetujui pengguna melalui pesan "deploy" dan berhasil. Verifikasi API domain publik: count sama dengan database (1 pending), request anonim 401, metode POST 405, cache no-store, serta bundle navbar dan link pending lolos. Browser super admin menampilkan badge 1 dan popover; klik tautan membuka tab Manage Users, filter Menunggu persetujuan, dan tepat 1 baris. Screenshot: `deployment/approval-notifications-live-20261012.png`.

PM2 doran-whatsapp online; flag WhatsApp/dispatch/queue dan PID telegram-sender dipertahankan. SHA-256 seluruh source dalam manifest dicocokkan oleh skrip. Tidak ada akun pelanggan disetujui/ditolak atau data pelanggan diubah untuk pengujian.

Percobaan pertama otomatis rollback karena verifier mencari navbar pada HTML server sebelum SessionProvider memuat sesi browser. Verifier diperbaiki untuk memeriksa bundle frontend, kemudian navbar diverifikasi langsung pada browser aktif. Backup percobaan pertama: `/home/jeblast/backups/doran-approval-notifications-1791787895`. Build staging sebelum izin rollout tetap tersimpan di `/home/jeblast/repos/.doran-approval-notifications-1791787488`.
