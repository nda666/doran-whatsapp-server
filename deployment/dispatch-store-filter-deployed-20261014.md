# Filter store Antrean Pengiriman

Aktif pada 14 Oktober 2026 (WIB) di https://dashboard.jeblast.com/dashboard/dispatch.

- Filter store: Semua store, Selain default, Hanya default. Pilih opsi lalu klik Cari.
- API `store_filter=non_default` mengecualikan storeId `default`; `store_filter=default` hanya mengambil storeId `default`.
- Digabung dengan nama store, status, tanggal, perangkat, sumber, transaksi dan Job ID. Tabel serta total pagination mengikuti filter; ringkasan tetap mengikuti tanggal dan batas usia data.
- Uji lokal pencarian, pagination, scope pengguna, tanggal dan usia data lulus; TypeScript src lulus. Pemeriksaan TypeScript seluruh workspace mencakup snapshot tmp dan gagal pada import snapshot yang tidak lengkap.
- Build Next.js dan TypeScript server terisolasi lulus. Verifikasi live mencocokkan total kedua opsi dengan database, memeriksa konflik nama store, ringkasan, tanggal, scope pengguna dan assets.
- Baseline diverifikasi, backup dan rollback otomatis tersedia. PM2 online, WhatsApp/dispatch aktif, PID telegram-sender tetap sama.

Build: `S2hnMRcKvsAxw-0W33wU6`.
Backup: `/home/jeblast/backups/doran-dispatch-store-filter-1791965202`.
Deployment selesai setelah pengguna secara eksplisit menyetujui unggahan dan pemasangan ke VPS.
