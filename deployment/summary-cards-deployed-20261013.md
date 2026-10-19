# Card ringkasan perangkat dan pengiriman

Aktif di https://dashboard.jeblast.com pada 13 Oktober 2026 (Asia/Jakarta).

Build ID: `urSdh_y_hxYbdBfD5nG72`.
Backup source/runtime: `/home/jeblast/backups/doran-summary-cards-1791857250`.

- Perangkat: Jumlah perangkat, Online, Offline, Aktif, Tidak aktif; refresh setiap 10 detik.
- Pengiriman: tujuh status existing ditampilkan sebagai card; polling existing setiap 5 detik.
- Angka 36px pada desktop dan 30px pada ponsel, format Indonesia, ikon, aksen warna, dukungan tema terang/gelap, grid responsif.
- Endpoint `GET /api/phones?summary=1` melakukan agregasi seluruh perangkat dalam ownerScope, terpisah dari filter dan pagination tabel; tidak mengembalikan token atau data perangkat.
- TypeScript source check lulus; konfigurasi default lokal juga memasukkan snapshot tmp sehingga tidak digunakan sebagai hasil validasi source.
- Build produksi Next.js dan TypeScript server terisolasi lulus.
- Verifikasi live: hitungan API sesuai database untuk admin dan pengguna biasa; pagination/filter tidak membatasi ringkasan; akses tanpa autentikasi ditolak; halaman menampilkan 5/7 card; asset JS/CSS berhasil diakses.
- Preview komponen desktop, ponsel 390px, dan tema gelap diperiksa; tidak ada overflow horizontal.
- PM2 doran-whatsapp online dengan WhatsApp dan dispatch aktif; PID telegram-sender tetap sama; digest source diverifikasi.

Deployment: `deploy-summary-cards-20261013.py`, menggunakan baseline source, backup, serta rollback otomatis.
