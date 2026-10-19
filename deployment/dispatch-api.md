# Antrean WhatsApp untuk aplikasi store

Endpoint live: `POST https://dashboard.jeblast.com/api/send-message`
(`POST /api/v2/send-message` memakai kontrak yang sama).

Parameter opsional `job_id` mengidentifikasi satu request pengiriman untuk satu perangkat. Kirim string stabil 1–128 karakter tanpa karakter kontrol, misalnya `ORDER-123-notification`, sejak request pertama dan gunakan kembali saat retry. Spasi di awal/akhir dihapus; ID peka huruf besar/kecil. ID yang sama pada perangkat lain merupakan job terpisah.

Jika belum ada, seluruh penerima disimpan atomik dengan `existing: false`. Jika sudah ada, API mengembalikan `existing: true`, `job_id`, dan status terakhir seluruh penerima job asli, tanpa memvalidasi ulang payload atau membuat pengiriman baru. Perubahan nomor, pesan, store, jenis pesan, atau endpoint pada retry tidak mengubah job asli. Gunakan `job_id` baru untuk pengiriman baru. Job `FAILED`/`UNCERTAIN` tetap dikembalikan sebagai status, tidak diantrekan ulang. Request bersamaan untuk ID yang sama diserialisasi melalui lock perangkat di database.

Contoh request: `POST /api/send-message {"api_key":"TOKEN_PERANGKAT","job_id":"ORDER-123-notification","number":"62812XXXXXXXX","message":"Pesanan telah dibuat."}`. Untuk status saja: `POST /api/send-status {"api_key":"TOKEN_PERANGKAT","job_id":"ORDER-123-notification"}`. `job_id` berbeda dari `data[].id`, yaitu ID internal pengiriman tiap penerima. Lookup `job_id` pada status memiliki prioritas atas `id`/`transaction_id`.

Dukungan berlaku pada send-message (termasuk alias public/v2) serta send-media, send-sticker, send-poll, send-button, send-list, send-location, dan send-vcard. Endpoint legacy send-attachment/send-group-message tidak menggunakan mekanisme ini. Antrean harus aktif; send-message dengan `job_id` saat antrean nonaktif ditolak HTTP 503. Tanpa `job_id`, perilaku `transaction_id` sebelumnya tetap berlaku. Perlindungan berlaku selama catatan dispatch disimpan.

Aktivasi perubahan: jalankan `npx prisma migrate deploy`, `npx prisma generate`, lalu build/restart aplikasi sesuai prosedur server. Migrasi `20261011120000_request_job_id` menambahkan kolom nullable dan index; job lama tetap dapat dibaca tetapi tidak memiliki `job_id` klien.

```json
{
  "api_key": "TOKEN_PERANGKAT",
  "store_id": "STORE-001",
  "transaction_id": "ORDER-20261009-000123",
  "message_key": "order-created",
  "number": "62812XXXXXXXX,62813XXXXXXXX",
  "message": "Pesanan ORDER-20261009-000123 telah dibuat."
}
```

`api_key` adalah token perangkat pengirim. Kirim ID store dan ID transaksi yang stabil dari sistem transaksi, bukan UUID baru pada setiap retry. Format ID adalah string, maksimum store 64, transaksi 128, jenis pesan 64 karakter, peka huruf besar/kecil. `message_key` opsional (default `default`); gunakan nilai berbeda jika satu transaksi memerlukan beberapa isi pesan untuk penerima yang sama.

Dedup berlaku per **perangkat pengirim + store + transaksi + jenis pesan + nomor penerima**, selama catatan dedupe disimpan. Format nomor dinormalisasi dan penerima duplikat dalam satu request digabung. Isi pesan/gambar berbeda untuk kunci yang sama menghasilkan HTTP 409, tanpa mengganti pesan lama. Payload request disimpan atomik untuk semua penerima. Simpan respons beserta ID pekerjaan tiap penerima.

Request lama tanpa ID tetap diterima dan diberi UUID transaksi otomatis, tetapi retry request tersebut tidak bisa dideduplikasi. Store harus mengirim `transaction_id` yang sama sejak request pertama untuk perlindungan terhadap respons HTTP yang hilang. `store_id` tanpa nilai memakai `default`; setiap store sebaiknya selalu mengirim ID masing-masing.

HTTP 200 dengan `result: true, queued: true` berarti **tersimpan**, bukan diterima HP. Respons berisi `transaction_id`, `store_id`, `message_key`, `deduplication_enabled`, dan `data` berisi status tiap penerima. Periksa `result` juga pada respons HTTP 200: token tidak valid masih memakai bentuk respons kompatibel `result: false`.

Status: `QUEUED` menunggu, `PROCESSING` sedang mengirim, `SENT` transport WhatsApp mengakui pengiriman, `DELIVERED` receipt tujuan tersedia, `READ` receipt dibaca tersedia, `FAILED` tidak terkirim, `UNCERTAIN` hasil belum pasti. Receipt dibaca tidak selalu tersedia. Saat offline pesan menunggu tanpa memakai percobaan; belum terkirim setelah 24 jam menjadi `FAILED`. Kegagalan persiapan gambar dicoba maksimal lima kali. Kegagalan/timeout setelah transport dimulai menjadi `UNCERTAIN` dan tidak diulang otomatis, termasuk pemulihan setelah worker crash. Periksa penerima sebelum mengirim ulang secara manual. Dedupe HTTP tidak dapat menjamin tepat satu pengiriman antara database dan jaringan WhatsApp saat hasil transport tidak diketahui.

Periksa status dengan `POST https://dashboard.jeblast.com/api/send-status`:

```json
{
  "api_key": "TOKEN_PERANGKAT",
  "store_id": "STORE-001",
  "transaction_id": "ORDER-20261009-000123",
  "message_key": "order-created"
}
```

Atau gunakan `GET /api/send-status?id=ID_PEKERJAAN` dengan header `Authorization: Bearer TOKEN_PERANGKAT`. Jangan menaruh token dalam URL. Hasil hanya milik perangkat tersebut; maksimum 100 per halaman, `page` mulai 1. `message_key` boleh dihilangkan untuk melihat seluruh jenis pesan transaksi. Dashboard pemilik tersedia di `/dashboard/dispatch`, diperbarui setiap lima detik.

Dashboard menampilkan alasan menunggu pada kolom Keterangan. Store `default` ditampilkan sebagai **Store tidak ditentukan**, dan kategori `message_key=default` sebagai **Umum**. Tombol **Lihat pesan** membuka isi yang tersimpan untuk penerima tersebut; isi pesan tetap mengikuti masa penyimpanan yang dijelaskan di bawah. ID transaksi dipakai untuk pelacakan dan deduplikasi: aplikasi store harus mengirim ID stabil yang sama saat retry, karena ID otomatis baru pada setiap request tidak melindungi retry dari pesan ganda.

Jika HTTP 503 atau koneksi API terputus, ulangi dengan semua ID dan payload yang sama, gunakan exponential backoff (misalnya 2, 4, 8, 16 detik). Respons 400/409 perlu diperbaiki, bukan diulang tanpa perubahan. Antrean menolak request baru saat pending mencapai sekitar 100.000. Maksimum 100 penerima, teks 10.000 karakter, gambar URL publik HTTP/S atau base64 maksimum 700 KB di request; download gambar maksimal 5 MB dan 15 detik. Request tanpa teks tidak diterima.

Antrean tersimpan di MySQL, sehingga tidak memerlukan Redis. Worker default empat pengiriman paralel lintas perangkat, satu pengiriman per perangkat dengan jeda minimum satu detik setelah proses selesai. Tidak ada klaim throughput WhatsApp nyata atau jaminan WhatsApp bebas pembatasan. Endpoint grup dan multipart attachment lama tidak memakai antrean ini; untuk order teks/gambar gunakan `/api/send-message`.

Pemeliharaan harian pukul 00.00 WIB menghapus isi teks/gambar hasil terkirim setelah tujuh hari, isi gagal/tidak pasti setelah 30 hari, serta riwayat/dedupe hasil terkirim/gagal setelah 180 hari. Metadata `UNCERTAIN` dipertahankan untuk pemeriksaan. Catatan menunggu/mengirim tidak dihapus. Setelah 180 hari, ID transaksi lama yang diulang dapat membuat pengiriman baru.

Validasi 9 Oktober 2026: build produksi; 20 request konkuren identik menghasilkan empat penerima unik; 175 request store/700 penerima tersimpan; konflik konkuren, status receipt tidak mundur, lease perangkat, offline, pemulihan crash, kedaluwarsa, scope token, dan URL media privat diuji. Seluruh tes pengiriman memakai transport tiruan: tidak mengirim WhatsApp nyata. Kecepatan penyimpanan sintetis bukan benchmark end-to-end.

Konfirmasi `SENT` menunggu node ACK server untuk message ID yang sama, dengan listener terpasang sebelum fungsi kirim dijalankan. Selesainya `sendMessage` saja tidak dianggap ACK. ACK hilang/berisi error menghasilkan `UNCERTAIN`; pengiriman tidak diulang otomatis oleh worker. Uji ACK hilang dilakukan dengan transport tiruan. Pemeriksaan HTTP dari luar VPS memvalidasi dedupe main/v2 dan scope status; perangkat sementara offline tetap nol percobaan dan seluruh datanya dihapus setelah pemeriksaan.

## ID Pengiriman dan Job ID Request

Simpan `data[].id` dari respons kirim sebagai ID Pengiriman per penerima. Untuk memeriksa satu pengiriman, kirim `POST /api/send-status {"api_key":"TOKEN_PERANGKAT","id":"UUID_PENGIRIMAN_DARI_DATA_ID"}`. Cocokkan webhook `dispatch.id` dengan ID Pengiriman yang disimpan kasir. Jangan memasukkan nilai `data[].id` ke field `job_id`.

`job_id` adalah ID request dari aplikasi pengirim dan dapat memiliki beberapa penerima. Tabel Antrean Pengiriman menampilkan ID Pengiriman dan Job ID Request secara terpisah. Jika request tidak menyertakan job_id, kolom Job ID Request kosong; ID Pengiriman tetap tersedia.
