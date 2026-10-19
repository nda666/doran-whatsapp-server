# Status user aktif / tidak aktif — aktif di produksi

12 Oktober 2026, Asia/Jakarta.

Manage Users menampilkan Status user (Aktif / Tidak aktif) terpisah dari Status persetujuan. Menu Aksi menyediakan Aktifkan / Nonaktifkan; form pengguna juga menyediakan switch status. Penonaktifan menolak login dan API akun, menaikkan sessionVersion untuk mencabut JWT lama, menghapus sesi database, memancarkan account:disabled dan memutus socket akun. Layout global menerima event tersebut dan sign out; SessionProvider melakukan pemeriksaan setiap 15 detik serta saat fokus kembali sebagai fallback. Aktivasi kembali tetap memerlukan persetujuan pendaftaran dan login baru. Administrator utama tidak dapat dinonaktifkan melalui endpoint status maupun form edit.

Migrasi additive 20261012150000_user_active_status menambah users.isActive (default true) dan users.sessionVersion (default 0). Akun lama tetap aktif dan sesi sebelumnya tetap valid sampai dicabut. Token API user tidak dirotasi.

Verifikasi lokal: pengujian deaktivasi/revokasi/socket event, inactive signin/API, JWT lama tetap ditolak setelah reaktivasi, sesi baru diterima, guard frontend melakukan signOut, perlindungan administrator, regresi akses super admin dan notifikasi, serta ESLint perubahan lolos. Build Linux staging menjalankan prisma generate dengan node_modules terisolasi, unit/regresi, Next production build, dan TypeScript server; semuanya lolos.

Paket: deployment/user-active-20261012.zip (20 file).
Build produksi: RNp78aPvwGbJH3gX7ue0q.
Backup database/source/runtime/dependency: /home/jeblast/backups/doran-user-active-1791789198.
Staging awal: /home/jeblast/repos/.doran-user-active-1791788993.

Pengguna menyetujui deployment fitur ini melalui pesan "deploy". Migrasi database dan promosi runtime berhasil. Verifikasi produksi dengan satu akun sintetis lolos: login NextAuth nyata, login/API ditolak ketika tidak aktif, event account:disabled diterima socket aktif, sesi lama tetap ditolak setelah reaktivasi, socket lama ditolak, login baru diterima, penonaktifan melalui form edit mencabut sesi baru, dan penonaktifan super admin ditolak melalui kedua endpoint. Akun sintetis telah dihapus. Data/status akun pelanggan tidak diubah oleh pengujian. Browser super admin menampilkan kolom Status user serta menu Nonaktifkan; screenshot: deployment/user-active-live-20261012.png. PM2 doran-whatsapp online; flag WhatsApp/dispatch/queue dan PID telegram-sender dipertahankan, serta seluruh source manifest dicocokkan SHA-256.

Skrip deployment menyiapkan backup database privat, hanya mengizinkan migrasi fitur ini sebagai migration pending, membackup source/runtime/dependency, mempromosikan build, dan melakukan verifikasi produksi. Verifier produksi memakai tepat satu akun sintetis @example.invalid, menguji login NextAuth nyata, penolakan akun tidak aktif, event logout langsung, API dan JWT lama setelah aktivasi ulang, penonaktifan via form edit, serta perlindungan super admin; akun sintetis dibersihkan. Rollback runtime otomatis mempertahankan kolom migrasi tambahan untuk menghindari kehilangan data.
