# Filter usia pengiriman di seluruh menu

Aktif pada 13 Oktober 2026 (Asia/Jakarta).

Build ID: `Ddi9C1so6NZhYkK__VmCq`.
Backup source/runtime: `/home/jeblast/backups/doran-dispatch-menu-age-1791859113`.

- Dashboard: card antrean/gagal/terkirim/perlu diperiksa, campaign aktif, grafik harian, distribusi status, aktivitas per jam dan ranking perangkat mengikuti setting usia sejak `waDispatch.createdAt`.
- Analitik menggunakan rolling window `days * 24 jam`, dengan tanggal/jam WIB dan keterangan sesuai setting. Pilihan tetap 7/30 hari dihapus. Grafik meliputi bucket tanggal WIB termasuk sebagian hari pertama dan terakhir.
- Campaign: daftar hanya campaign dengan data antrean dalam rentang; ringkasan status, total dan riwayat penerima memakai rentang sama. Pencarian perangkat digabung dengan batas usia pada relasi pesan.
- Laporan dan CSV: periode pencarian dipotong oleh batas usia global; default laporan langsung menampilkan rentang setting. Keterangan rentang tampil pada laporan dan campaign.
- Hitungan pengiriman per perangkat pada API phones mengikuti usia global, dengan metadata `sentCountDays`.
- Kondisi perangkat tetap keadaan saat ini. Log webhook, pemeriksaan status berdasarkan ID, deduplikasi, pengamanan edit campaign, dan operasi pengiriman tidak diubah oleh filter tampilan.
- Data lama tetap tersimpan. Setting dibaca setiap request, tanpa mengubah nilai 3 yang digunakan pengguna.
- Uji setting 1/3/5, scope owner/admin, batas tepat cutoff, pesan lama yang baru terkirim, seluruh card/chart, campaign/history, laporan/CSV, dan hitungan perangkat lulus.
- TypeScript aplikasi lokal dan build produksi terisolasi (termasuk TypeScript server) lulus; uji dispatch/worker sebelumnya tetap lulus.
- Verifikasi live admin dan owner: hitungan dashboard/chart, campaign/history dan laporan cocok dengan query database dalam rentang metadata; bundle memuat keterangan sesuai setting dan tidak memuat selector tetap 7/30.
- Browser terautentikasi menunjukkan card 3 hari, rentang tanggal/jam WIB dan diagram. Screenshot: `output/dispatch-menu-age-dashboard-20261013.jpg`.
- PM2 online, dispatch/WhatsApp aktif, source digest cocok paket, PID telegram-sender tetap sama.

Percobaan deployment awal otomatis rollback karena pemeriksaan caption UI gagal. Caption dikoreksi dan deployment berikutnya lulus seluruh pemeriksaan.
