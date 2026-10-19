# Perbaikan card dashboard

Aktif pada 13 Oktober 2026 (Asia/Jakarta).

Build: `TmWdZxHQ6rg6RzvXKZHUe`.
Backup: `/home/jeblast/backups/doran-dispatch-total-1791866683`.

- Dashboard utama: card ringkasan memakai tinggi 100% dalam baris yang sama, termasuk card langganan pengguna.
- Card Jumlah perangkat menampilkan Online dan Offline (jumlah perangkat dikurangi online).
- Antrean Pengiriman: Total Data Antrean Pengiriman menjadi card pertama; total seluruh status mengikuti rentang usia dan scope akun, terlepas dari filter pencarian/pagination.
- TypeScript dan preview lokal admin/pengguna lulus. Build Next.js dan TypeScript server terisolasi lulus.
- Verifikasi live: 8 card dispatch, total pertama, ikon dan assets valid; style tinggi card utama dan label offline tersedia pada bundle produksi; API saat pemeriksaan menunjukkan 68 perangkat, 20 online, 48 offline; total dispatch sesuai penjumlahan status.
- Source digest sesuai paket, PM2 online, WhatsApp/dispatch tetap aktif dan PID telegram-sender tetap sama.
- Deployment disetujui pengguna, memakai pemeriksaan baseline, backup dan rollback otomatis.
