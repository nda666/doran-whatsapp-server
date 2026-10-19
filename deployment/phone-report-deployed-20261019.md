# Rekap per Nomor WA — deployed 19 Oktober 2026 (WIB)

Live: https://dashboard.jeblast.com/dashboard/reports?view=phones

Build: `YNp9harRvNeXfcl332-l4`.
Backup sumber dan runtime: `/home/jeblast/backups/doran-phone-report-1792374601`.

Rekap per perangkat/nomor WA memiliki filter tanggal mulai–selesai dalam WIB, filter perangkat, ringkasan, pengurutan, pagination, dan ekspor CSV seluruh hasil. Menu Lihat laporan pada perangkat membuka rekap dengan perangkat otomatis terpilih. Detail laporan sebelumnya tersedia di tab Detail pengiriman.

Berhasil terkirim mencakup SENT/DELIVERED/READ berdasarkan sentAt. Gagal, menunggu/diproses, belum pasti, dan diblokir berdasarkan createdAt dan status saat ini. Rekap memakai riwayat WaDispatch tersimpan tanpa pembatas usia tampilan antrean. Nomor tanpa aktivitas bernilai nol; pengiriman dari perangkat yang sudah dihapus tetap masuk rekap historis dengan ID perangkat. Nomor mengikuti metadata perangkat saat ini. Tidak ada migrasi database.

Validasi:

- Unit verifier: batas tengah malam WIB, pesan dibuat sebelum periode tetapi dikirim dalam periode, seluruh status, isolasi pemilik/admin, perangkat nol/dihapus, tanggal tidak valid, pagination, urutan, serta escaping formula CSV lulus.
- Build produksi Next.js/TypeScript terisolasi lulus. Pemeriksaan HTTP terautentikasi terhadap database dijalankan sebelum promosi.
- Pemeriksaan HTTPS publik lulus: halaman laporan dan build aktif, aset JavaScript, API rekap, CSV, filter perangkat, validasi tanggal, akses anonim ditolak, serta API detail lama.
- Tanggal 18 Oktober 2026: 63 perangkat, 704 pesan berhasil terkirim; angka cocok dengan database dan formulir browser publik. Browser menampilkan 5.472 total pesan, 4.768 menunggu/diproses, dan nol gagal pada waktu pengujian.
- Menu Aksi → Lihat laporan diuji di browser produksi; nomor/perangkat otomatis terpilih.
- Proses aplikasi online, pengiriman WhatsApp dan antrean tetap enabled, PID Telegram dipertahankan. Cadangan lama dipertahankan dan staging dibersihkan.

Percobaan staging pertama berhenti sebelum promosi karena skrip verifikasi memakai nama cookie HTTP sementara konfigurasi NextAuth tetap HTTPS. Nama cookie pemeriksa disesuaikan dengan NEXTAUTH_URL; percobaan berikutnya lulus.

Log: `deployment/phone-report-deploy-20261019.log`, `deployment/phone-report-public-verify-20261019.log`.
