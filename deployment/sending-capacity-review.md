# Pengiriman WhatsApp untuk 175 store

Pemeriksaan: 9 Oktober 2026, dashboard.jeblast.com.

## API dari luar

`POST https://dashboard.jeblast.com/api/send-message` tetap menerima request server store tanpa login dashboard. Autentikasinya memakai **token perangkat**, melalui `api_key` di body JSON. Token user dashboard berbeda dari token perangkat.

Field pengiriman yang dipertahankan: `api_key`, `number`, `message`, serta opsi yang sudah ada. `number` dapat berisi beberapa nomor dipisahkan koma. Respons HTTP 200 saja tidak membuktikan berhasil: integrasi store harus membaca `result`.

Opsi baru `dry_run: true` memvalidasi request/token dan melaporkan apakah WhatsApp diaktifkan, serta status aktif/online perangkat. Opsi ini **tidak mengirim pesan**. Hilangkan field tersebut untuk pengiriman biasa. `result: true` pada dry-run berarti request/token valid, bukan bukti pengiriman. Pada pengiriman nyata, ID pesan berarti transport WhatsApp mengembalikan pesan; bukan jaminan sudah diterima/dibaca tujuan.

Pengujian HTTPS dari komputer di luar VPS berhasil: token valid mendapat 200/result=true; token salah mendapat result=false. Sebanyak 20 dry-run, maksimal 5 bersamaan, berhasil seluruhnya: p50 747 ms, p95 1.206 ms, maksimum 1.219 ms. Pengujian ini dilakukan sebelum optimasi pool final dan menguji jalur HTTP/validasi/database saja, bukan throughput pengiriman WhatsApp.

## Opsi Test Kirim

Pada daftar perangkat, menu **Action → Test Kirim** tersedia untuk perangkat aktif dan online. Form meminta satu nomor tujuan dan pesan maksimal 1.000 karakter. Pesan hanya dikirim saat pengguna menekan **Kirim 1 Pesan Test**. Endpoint dashboard memeriksa autentikasi, kepemilikan, status aktif/online dan satu penerima. Timeout tidak otomatis mengirim ulang; pengguna diminta memeriksa tujuan terlebih dahulu.

Build, lint/TypeScript, pengujian sender dengan transport tiruan, serta pengecekan penolakan live tanpa login/nomor tidak valid/perangkat nonaktif berhasil. Tidak ada pesan WhatsApp nyata yang dikirim selama pemeriksaan ini.

## Kapasitas dan batas kesimpulan

Snapshot host: 8 CPU logis, RAM sekitar 28 GB, RAM bebas sekitar 24 GB, load 0,18/0,20/0,17. Proses aplikasi sekitar 390 MB dan CPU sekitar 0,4%; ruang filesystem tersedia sekitar 596 GB. Ini snapshot kondisi ringan, bukan batas kapasitas pengiriman terukur. Terdapat 68 perangkat, 65 aktif, dan 16 online saat pemeriksaan. Jumlah pengirim yang benar-benar digunakan oleh 175 store serta transaksi puncak per menit belum diketahui.

| Contoh transaksi per store per menit | Transaksi gabungan/menit | Pesan gabungan/menit (3–4 per transaksi) |
| --- | ---: | ---: |
| 0,2 | 35 | 105–140 |
| 1 | 175 | 525–700 |
| 5 | 875 | 2.625–3.500 |

Contoh tersebut menghitung kebutuhan; bukan klaim batas aman WhatsApp atau kapasitas aplikasi.

Saat ini API utama menunggu pengiriman langsung, tanpa antrean pengiriman tersimpan. Penerima dalam satu request diproses berurutan, tetapi request lain dapat masuk bersamaan ke perangkat yang sama. Jika request mengirim beberapa penerima lalu gagal di tengah, sebagian pesan dapat sudah terkirim. Tanpa ID transaksi/idempotensi, mengulang seluruh request dapat menggandakan pesan yang sebelumnya berhasil. Jika proses berhenti atau perangkat offline, pekerjaan yang belum selesai tidak memiliki mekanisme pemulihan durable.

Redis belum berjalan, queue dinonaktifkan, dan worker V2 yang ada masih contoh pencatatan log. Memasang Redis saja belum menghasilkan worker pengiriman produksi.

Perbaikan yang sudah dilakukan dalam pemeriksaan ini: satu Prisma client/pool dibagikan antar custom server dan bundle API (sebelumnya assignment singleton tidak berjalan); log request/hasil pesan yang memuat token/konten dihapus; kegagalan retry tidak lagi dianggap sukses tanpa pesan; media tetap dibawa ketika retry; retry tidak menghapus socket secara manual dan menciptakan duplikasi koneksi.

**Kesimpulan:** sumber daya host masih longgar, tetapi belum ada bukti pengiriman nyata mampu menghadapi puncak 175 store secara andal. Sebelum menyatakan siap, diperlukan antrean tersimpan, ID transaksi + penerima untuk deduplikasi, status per pesan/penerima, retry terkontrol, pembatasan concurrency per pengirim dan pemantauan backlog. Antrean menerima pekerjaan terlebih dahulu; worker memprosesnya terpisah. Desain retry tetap harus menangani kemungkinan pesan sudah terkirim saat acknowledgment hilang.

Rujukan desain antrean: [BullMQ queues](https://docs.bullmq.io/guide/queues/), [idempotent jobs](https://docs.bullmq.io/patterns/idempotent-jobs), [retrying failing jobs](https://docs.bullmq.io/guide/retrying-failing-jobs).

Langkah kapasitas berikutnya adalah mencatat transaksi puncak/menit, distribusi sender per store, dan target waktu pengiriman; lalu menguji antrean dengan transport tiruan pada staging dan pengiriman terbatas ke penerima uji yang ditentukan pengguna. Perubahan menjadi queue-first belum dilakukan dalam pemeriksaan ini agar kontrak API store yang sedang berjalan tetap terjaga.

Backup rollback: `/home/jeblast/backups/doran-test-send-20261009`.

Update 9 October 2026: the durable MySQL dispatch queue is now implemented for JSON main/v2 sends and Test Kirim. See dispatch-api.md. The earlier no-queue findings describe the system before this change. Synthetic admission tests persisted 700 recipients from 175 stores; this is not a real WhatsApp throughput benchmark. Default concurrency is four senders and one transport at a time per device, with at least a one-second gap after completion.
