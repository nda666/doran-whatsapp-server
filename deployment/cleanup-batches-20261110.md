# Reset perangkat bertahap — 10 November 2026

Patch produksi dibangun dari baseline server dalam staging terisolasi. Build aktif
`3M1Owroj2WvJYgyS5dkr6`. Backup versi akhir berada di
`/home/jeblast/backups/doran-cleanup-followup-1794301898` (runtime, source,
database dump privat, manifest dan log pemeriksaan). Dump lengkap awal (2,2 GB)
dibuat pada backup `doran-cleanup-batches-1794300699` dan dipertahankan melalui
hardlink pada backup versi akhir; patch lanjutan hanya mengubah kode. Audit database sebelum dan
sesudah pertukaran runtime dibandingkan dan sama. Tidak ada migrasi schema.

## Perilaku

- Autentikasi, kontak, protokol dan pesan dihapus dalam batch maksimal 200 baris;
  riwayat dispatch dihapus 50 job per transaksi, bersama event webhook terkait.
- Transaksi batch perangkat mempunyai batas eksplisit 120 detik; batch auth dan
  finalisasi 60 detik. Kunci sender diperbarui
  setiap batch; kunci global webhook perangkat hanya diambil saat finalisasi.
- Dispatch dikunci per ID dengan urutan primary key sebelum event dan job dihapus.
  Tidak ada pengambilan kunci global konfigurasi webhook dispatch. Ini mengikuti
  urutan lock job pada status writer dan mencegah late receipt membuat event yatim.
- Batch memeriksa kembali akses perangkat. Pengiriman PROCESSING diperiksa baik
  sebagai identitas asal maupun sebagai pengirim aktual.
- Reset autentikasi mengambil lease eksklusif dan menghapus creds lebih dahulu.
  `migratedAt=1970-01-01T00:00:00.000Z` merupakan penanda reset yang belum selesai.
  Pembuatan socket menolak sesi dengan penanda itu, termasuk sesudah restart.
  Setelah seluruh auth key terhapus, penanda diganti dengan tombstone normal.
- Kegagalan penyimpanan sesi lama tidak menggagalkan reset auth yang memang diminta.
  Penutupan owner tetap dicoba dan lease owner lain tetap diperiksa sebelum hapus.
  Disconnect tanpa hapus auth tetap melaporkan kegagalan penyimpanan itu.
- Kegagalan mempertahankan perangkat nonaktif. Pengulangan membersihkan sisa
  batch tanpa merotasi token atau melaporkan sukses sebelum finalisasi selesai.
- Dashboard memakai POST `?background=1`, menerima HTTP 202/jobId, kemudian
  melakukan polling GET dengan jobId. Respons sukses baru diberikan sesudah
  seluruh pembersihan selesai. API sinkron sebelumnya tetap tersedia.
- Status job hanya dapat diakses oleh pengguna yang memulainya, termasuk setelah
  baris perangkat dihapus. Job berjalan dan statusnya disimpan dalam proses, bukan
  antrean persisten; setelah restart perlu mengulangi reset. Marker auth dan
  perangkat nonaktif melindungi sisa data saat proses terputus. Status job selesai
  dipertahankan 30 menit dan dibersihkan saat ada permintaan reset baru.

## Validasi

- Typecheck seluruh project dan lint lulus (peringatan React Hook lama tetap ada).
- Uji reset lama, reset 8.286 kontak dan kegagalan pada batch kedua lulus.
- Uji 39.242 auth key, penghapusan creds lebih dahulu, rollback/resume,
  penolakan sesi dengan marker reset, isolasi perangkat lain dan kompetisi lease lulus.
- Uji job deduplication, akses status, hasil setelah delete, kegagalan job, API 202,
  polling dashboard, kompatibilitas sinkron dan propagasi error lulus.
- Build Linux produksi, suite hardening WhatsApp dan seluruh suite CI produksi
  lulus pada staging sebelum promosi.
- Pemeriksaan login, database dan polling worker lulus setelah restart. Peringatan
  `SENDER_OFFLINE_WITH_BACKLOG` merupakan kondisi antrean yang sudah ada.

Tujuh file aplikasi/verifikasi dipromosikan pada patch awal; lima file termasuk
uji background dipromosikan pada patch lanjutan. Perubahan lokal lain pada daftar nomor,
dispatch worker, send guard dan CI/CD tidak ikut dipromosikan. Allowlist CI lokal
ditambah tiga uji reset untuk deployment selanjutnya.

## Pemulihan nomor yang dilaporkan

Target `628388786848`, Store DG Yogyakarta,
`13cf4e0e-7c67-4368-94a2-01152e3340e9`. Helper memakai API background yang sama
dengan dashboard, mempertahankan token API dan baris perangkat. Baseline hash
token, job ID serta verifikasi akhir disimpan privat pada backup di atas.
Reset API background versi akhir terverifikasi pada **16:20:14 WIB**. Auth key,
kontak, protokol, dispatch dan percakapan semuanya nol; nomor akun kosong,
`active=1`, `status=CLOSE`, `isOnline=false`. Hash token sama dengan baseline
sebelum pemulihan. Perangkat siap scan QR ulang. Finalisasi API dilakukan ketika
layanan tetap berjalan; tidak ada penghentian layanan untuk pembersihan akhir.

Pemeriksaan akhir `LOGIN_DATABASE_DISPATCH_READY` lulus. Semua proses PM2 terkait
online dan snapshot menunjukkan 56 perangkat online. Auto-reply target juga nol.
Retensi cadangan lama pada helper promosi awal dilanjutkan setelah reset selesai;
bukti baseline, job dan hasil reset sudah disalin ke backup versi akhir sebelum itu.
