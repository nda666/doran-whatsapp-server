# Log, kontak, media, dan penjelasan diagram dashboard

Aktif 14 Oktober 2026 (WIB).
Build: `ISTn37W71s99WYASqWPXl`.
Backup: `/home/jeblast/backups/doran-dashboard-enhancements-1791945067`.

- Log pesan masuk: tanggal mulai/selesai berdasarkan receivedAt, default hari ini dan dua hari sebelumnya dalam WIB. Akhir tanggal inklusif, validasi tanggal dan urutan tanggal di form/API, reset pagination setelah pencarian. Tab keluar memakai filter Dispatch yang sudah tersedia.
- Kontak dan media: kolom Dibuat (WIB), format DD/MM/YYYY HH:mm:ss, berdasarkan createdAt saat insert. Sort kontak createdAt ditambahkan ke daftar field yang diizinkan; sort media sudah tersedia.
- Pesan terkirim: nilai setiap batang terlihat di atas batang tanpa hover, termasuk nol pada hari kosong dalam diagram berisi data. Jarak batang menyesuaikan jumlah digit untuk mencegah label bertumpuk.
- Aktivitas per jam: menampilkan rentang tanggal/jam WIB dari API serta jumlah hari sesuai setting. Penjelasan menyatakan total seluruh tanggal, bukan rata-rata harian, contoh jam 09, syarat tanggal masuk antrean dan terkirim, serta hari pertama/terakhir parsial.
- TypeScript lokal, uji filter log/batas WIB/owner/pagination/validasi dan render nilai batang lulus; build produksi terisolasi Next.js + TypeScript server lulus.
- Preview desktop/mobile lulus: kolom timestamp WIB, input tanggal, label angka diagram, teks penjelasan, dan tidak ada overflow halaman (diagram/tabel scroll internal).
- Verifikasi live lulus: jumlah log dibanding database, batas tanggal, timestamp/sort kontak/media, total diagram harian/per jam dan setiap jam WIB dibanding database untuk admin/user, serta bundle produksi.
- Baseline dan digest diperiksa, source/runtime dibackup, rollback otomatis tersedia. PM2 online, WhatsApp/dispatch tetap aktif, PID telegram-sender tetap sama.
