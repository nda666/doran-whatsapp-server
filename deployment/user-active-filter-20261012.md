# Filter status user — aktif di produksi

12 Oktober 2026, Asia/Jakarta.

Pencarian Manage Users memiliki filter Status user: Semua status user / Aktif / Tidak aktif. Filter dikombinasikan dengan status persetujuan serta nama/email, dan pagination kembali ke halaman 1 ketika pencarian diterapkan. Link notifikasi persetujuan menghapus filter aktif sebelumnya. API menerima active=true/false dan memakai where yang sama untuk rows dan total; nilai filter lain ditolak 400.

ESLint perubahan, regresi akses super admin, build Next produksi, dan TypeScript server di staging Linux lolos. Paket: deployment/user-active-filter-20261012.zip (3 file). Build produksi: oceImYYCFXXz7EsZ527sW. Backup source/runtime: /home/jeblast/backups/doran-user-active-filter-1791789760. Staging awal: /home/jeblast/repos/.doran-user-active-filter-1791789547.

Pengguna menyetujui rollout dengan pesan "deploy". Deployment berhasil; PM2 doran-whatsapp online, flag WhatsApp/dispatch/queue dan PID telegram-sender dipertahankan. Source manifest cocok SHA-256. Tidak ada migrasi atau perubahan data akun.

Verifikasi domain publik lolos: filter semua/aktif/tidak aktif, kombinasi persetujuan dan pencarian nama/email, total data cocok database, dan filter tidak valid mendapat 400. Browser menampilkan filter Status user; Tidak aktif menghasilkan daftar kosong, Aktif menampilkan dua akun aktif. Screenshot: deployment/user-active-filter-live-20261012.png.
