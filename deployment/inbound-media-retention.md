# Deduplikasi inbound dan optimasi media

## Perubahan

- Claim efek inbound menggunakan unique key database per perangkat, identitas pesan/percakapan dan jenis aksi. Claim tidak dihapus saat restart atau maintenance konten. Pesan tanpa identitas lengkap tidak memicu webhook/auto-reply; permintaan STOP tetap dihormati.
- Histori `append` tetap dapat disimpan sebagai histori, tetapi tidak mengonsumsi claim live dan tidak memicu webhook/auto-reply. Webhook `message.incoming` sekarang hanya diterbitkan untuk event `notify`.
- STOP live mempunyai claim terpisah yang dibuat satu transaksi bersama suppression, revocation consent dan penahanan antrean. Replay STOP yang sama tidak mengulang efek tersebut. STOP dari histori tidak mencabut persetujuan ulang yang mungkin sudah lebih baru.
- Download media percakapan dan pustaka media menggunakan streaming, single byte-range, suffix-range, dan HEAD. File descriptor ditutup saat download selesai atau dibatalkan.
- Lampiran inbound ditulis bertahap dengan backpressure dan batas ukuran, tanpa mengumpulkan seluruh buffer dalam RAM. Pengiriman lampiran chat memakai ulang buffer yang telah dibaca.
- Index tambahan tersedia untuk query kebijakan penerima, receipt pesan, lookup file chat dan pemilihan retensi.

## Aktivasi schema

Migration: `20261101030000_inbound_dedupe_media_indexes`.

Deploy wajib memasang schema sebelum menjalankan kode baru, lalu generate Prisma client dan build. Jalur deployment additive repository sudah mengenali migration beserta checksum-nya melalui `cd-feature-schema.cjs`. Gunakan prosedur backup dan deployment yang berlaku; jangan menjalankan migrasi historis secara membabi buta pada database yang memiliki drift.

Jika tabel claim tidak tersedia atau database gagal, efek live ditahan dan dicatat sebagai `INCOMING_CLAIM_FAILED`. Tidak ada fallback dedupe memori. Penambahan index pada tabel besar perlu jendela deploy yang sesuai dan evaluasi EXPLAIN di staging.

## Retensi

Maintenance berjalan dua menit setelah server siap, lalu setiap jam. Satu proses tidak menjalankan dua putaran bersamaan; graceful shutdown menunggu putaran aktif.

| Pengaturan | Default | Efek |
| --- | --- | --- |
| `CHAT_MEDIA_RETENTION_DAYS` | `0` | Jika diaktifkan, lepas lampiran chat yang lebih tua dari jumlah hari ini. |
| `CHAT_CONTENT_RETENTION_DAYS` | `0` | Jika diaktifkan, kosongkan teks/quote chat yang sudah tua dan preview percakapan yang sudah tua. |

Nilai aktif harus berupa bilangan bulat 30–3650 hari. Nilai kosong, `0`, atau tidak valid mempertahankan konten. Tidak ada penghapusan konten pelanggan berdasarkan umur sampai pengaturan ini diaktifkan. Contoh kebijakan yang dapat dipilih operator: media 90 hari, teks 180 hari; ini bukan nilai bawaan.

Setiap putaran memproses maksimal 250 baris per jenis retensi. Pesan SENDING/UNCERTAIN dilindungi. ID pesan, request ID dan request hash tetap disimpan agar retry integrasi tidak berubah menjadi kirim ulang. Metadata claim inbound juga tetap disimpan.

Cleanup file yatim aktif secara default: hanya filename milik aplikasi pada `storage/chat-media` dan `storage/campaign-media`, minimal 24 jam sejak modifikasi/pembuatan, tanpa referensi database. Maksimal 250 file per direktori per putaran. Tidak mengikuti symlink atau menghapus direktori. File pustaka dengan MediaAsset aktif tetap disimpan. Kegagalan DB menghentikan cleanup, bukan menganggap file tidak terpakai. Folder uploads legacy dan auth WA tidak disentuh.

Penghapusan lampiran dilakukan dengan melepas referensi DB terlebih dahulu; file yatim disapu sesudahnya. Crash di antara dua langkah meninggalkan file yatim yang dapat dibersihkan pada putaran berikutnya, bukan baris aktif yang kehilangan file. Retensi tidak menghapus conversation atau metadata pesan. Data lama yang dikirim ulang oleh WA dapat muncul kembali sebagai histori setelah conversation dihapus manual; claim permanen tetap mencegah efek kirim yang sama berulang.

## Batas jaminan

### Batas usia auto-reply opsional

Global Settings menyediakan `auto-reply-max-age-seconds` (bilangan bulat 0–86400 detik). Default `0` menonaktifkan batas baru; `120` berarti dua menit. Setting ini terpisah dari usia antrean dan dibaca untuk setiap batch notify tanpa restart. Tidak memerlukan migration tambahan karena memakai tabel GlobalSetting yang sudah ada.

Usia dihitung dari messageTimestamp (Unix seconds/protobuf Long) terhadap waktu event diterima, sebelum proses storage/media. Pesan melewati batas tetap disimpan jika penyimpanan histori aktif dan tetap diteruskan ke webhook perangkat maupun rule webhook. Hanya balasan otomatis biasa dan AI yang ditahan, termasuk balasan terhadap quoted message. STOP tetap diproses terpisah.

Saat batas aktif, timestamp kosong/rusak atau lebih dari 60 detik di masa depan tidak memicu balasan otomatis. Kegagalan membaca setting menahan balasan otomatis batch tersebut sambil tetap memproses histori, webhook dan STOP. Pengaman AI lain yang sudah ada tetap berlaku. Mengubah setting tidak memutar ulang pesan yang sudah diklaim oleh dedupe.

Aktifkan batas hanya bila bisnis menerima konsekuensi bahwa pesan pertama pelanggan yang tertunda karena koneksi dapat memerlukan balasan manual. Tidak ada pengaturan produksi yang diubah oleh implementasi ini.

Claim memberi admission **at-most-once**. Bila proses mati setelah claim commit tetapi sebelum webhook/balasan selesai, efek tersebut tidak otomatis diulang. Exactly-once melintasi WhatsApp/HTTP memerlukan dukungan idempotensi penerima dan outbox terpisah. Perubahan ini mengutamakan pencegahan balasan duplikat dan tidak menambahkan blind retry pada hasil ambigu.

Ledger baru hanya mengetahui event yang diklaim setelah aktivasi. Tidak ada backfill dari histori chat karena baris histori tidak membuktikan apakah webhook atau auto-reply pernah selesai. Pergantian identitas PN/LID disamakan bila identitas alternatif tersedia pada pesan; event tanpa mapping tersebut tidak dapat dipastikan identik lintas bentuk alamat.

Retensi konten tidak mencakup seluruh salinan data: inbox/webhook log, backup dan protocol store memiliki kebijakan sendiri. Claim berbasis identitas pesan tidak menyimpan body, tetapi tetap merupakan metadata yang perlu dilindungi.

## Verifikasi

- `node deployment/verify-inbound-media-retention.cjs`: dedupe setelah reload, claim konkuren, append sebelum notify, fail-closed DB, batas/cleanup partial download, byte-range/HEAD/abort, default preservasi data, file aktif/recent/UNCERTAIN terlindungi, retensi idempotent.
- `node deployment/ci-tests.cjs`: PASS, OFFLINE_REGRESSION_SUITE_PASSED, termasuk pengujian baru.
- Batas usia tambahan: `verify-auto-reply-age.cjs`, `verify-pairing-identity.cjs` dan `verify-webhook-sender.cjs` PASS untuk validasi setting, batas timestamp, event diterima sebelum media lambat, quoted reply, webhook terpisah, STOP dan kegagalan setting. Seluruhnya termasuk suite offline.
- `npx tsc --noEmit --incremental false` dan `npx tsc --project tsconfig.server.json --noEmit`: PASS.
- `npm run lint`: PASS dengan 8 warning Hook yang sudah ada.
- Migration aktual dan pengujian claim konkuren/STOP rollback/replay dengan dua client pada MySQL 8.0.30 terisolasi: PASS. Tidak memakai database aplikasi atau mengirim pesan nyata.
- Handler `messages.upsert` aktual dengan fixture transport: PASS untuk append→notify, redelivery, claim DB gagal, dan STOP histori.
- Build produksi Next.js + TypeScript server: PASS dengan preload lokal sementara untuk membatasi pembacaan file di Windows. Build biasa pertama terhenti `EMFILE` setelah kompilasi berhasil; preload hanya dipakai saat verifikasi dan tidak masuk runtime/deployment. Peringatan page-data besar yang sudah ada tetap muncul.

Uji MySQL terisolasi dapat dijalankan dengan DATABASE_URL loopback menuju database khusus `wa_inbound_ci`, setelah schema test dipasang, menggunakan `node -r ./deployment/ci-register.cjs deployment/verify-inbound-dedupe-mysql.cjs`. Script menolak nama database lain.
