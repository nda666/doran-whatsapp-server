# Deployment pembatasan akses super admin

Aktif pada 12 Oktober 2026 (Asia/Jakarta) di https://dashboard.jeblast.com.

Build produksi: `hYGUtLIXt-pYohhexZtPW`.
Backup sebelum deployment final: `/home/jeblast/backups/doran-super-admin-access-1791785274`.

Menu Admin Panel dan Master Paket kini hanya tersedia untuk akun `admin@gmail.com` dengan role ADMIN dan status APPROVED. Halaman langsung memeriksa identitas terkini di database. Semua API admin, endpoint user lama, dan konsol antrean teknis menerapkan penjagaan super admin. Akses operasional user tetap dibatasi ke data miliknya.

Build Linux dilakukan di direktori staging dengan worker/koneksi WhatsApp dinonaktifkan. Uji menu/halaman/API, kepemilikan perangkat, webhook perangkat/status, dan log webhook lolos. Uji khusus memuat middleware antrean dari hasil kompilasi tanpa tsconfig-paths, kemudian memeriksa penolakan request anonim sebelum promosi runtime.

Verifikasi produksi dilakukan melalui localhost dan domain publik dengan bearer token serta cookie JWT. USER dan ADMIN selain super admin mendapat 403 dari API admin dan diarahkan ke dashboard saat membuka halaman admin/master paket. Super admin mendapat 200 dari halaman dan API admin. Dua akun sintetis diperlukan karena tidak ada akun user biasa yang disetujui sebelumnya; kedua akun uji berhasil dihapus. Tidak ada pengiriman WhatsApp/webhook pelanggan atau perubahan data pelanggan dalam verifikasi.

PM2 doran-whatsapp online; flag WHATSAPP_ENABLED, DISPATCH_QUEUE_ENABLED, dan QUEUE_ENABLED dipertahankan. PID telegram-sender tidak berubah. Source dalam manifest deployment telah dicocokkan dengan SHA-256 sebelum catatan dokumentasi ini ditambahkan.

Dua percobaan awal otomatis rollback: pertama karena alias impor tidak tersedia pada custom server Node, kedua karena verifikasi memerlukan akun user biasa yang belum ada. Impor middleware diperbaiki menjadi path relatif dan uji runtime ditambahkan; verifier produksi kini memakai akun uji sementara dengan cleanup. Backup percobaan tersebut berada di `/home/jeblast/backups/doran-super-admin-access-1791784954` dan `/home/jeblast/backups/doran-super-admin-access-1791785164`.
