# Telegram sebagai kanal pengiriman aplikasi

Telegram sekarang memakai antrean dispatch dan pengamanan yang sama dengan WhatsApp. Buat perangkat dengan kanal Telegram di menu Perangkat HP, lalu gunakan token/device_id perangkat tersebut pada API yang sama. Kanal perangkat tidak dapat diubah setelah dibuat agar antrean lama tidak berpindah layanan.

## Alur dan aturan yang sudah disatukan

- API send-message (GET/POST dan alias public), send-media untuk gambar, test kirim teks/gambar, serta campaign teks/gambar.
- Token perangkat/token user, kepemilikan dan batas perangkat, job/transaksi, deduplikasi, konflik isi, batas antrean dan masa simpan.
- Urutan antrean, jadwal/pause/resume/jeda campaign, kuota global/perangkat, reset WIB atau sesudah penuh, pemanasan manual, jam operasional global/perangkat, jeda acak global/perangkat, pause, dan pengamanan adaptif.
- reserveSend yang sama, daftar blokir/opt-out tersimpan, statistik percobaan/kegagalan, waktu terakhir pengiriman diproses, riwayat percobaan, laporan dan webhook status dispatch.
- Seleksi grup/penggantian manual hanya dalam kanal yang sama. Seluruh perangkat Telegram saat ini memakai satu konfigurasi Doran Dev; menambah perangkat bukan berarti menambah akun/sender provider yang berbeda.

## Batas kontrak provider

Kontrak yang tersedia hanya POST /api/send: phone, peer_type=user, message, media_url dan caption untuk gambar. Belum ada endpoint untuk pesan masuk, sesi/QR, typing, read receipt, panggilan, grup Telegram, pengecekan nomor, video/audio/dokumen/stiker, tombol/list/polling, lokasi atau vCard. UI membatasi pilihan dan API menolak fitur yang belum didukung dengan 422; worker juga memvalidasi konten tersimpan.

**Kesetaraan 100% seluruh kemampuan WhatsApp belum dapat diklaim.** Aturan pengiriman aplikasi sudah disatukan; kemampuan protokol yang belum tersedia membutuhkan dokumentasi/endpoint tambahan dari provider. Pemanasan manual berlaku. Pemanasan otomatis karena sesi offline dan email peringatan sesi tetap khusus WhatsApp, karena Telegram belum menyediakan sinyal sesi. Daftar blokir berlaku; penangkapan STOP otomatis Telegram memerlukan webhook pesan masuk.

Telegram menampilkan status Provider dikonfigurasi, bukan sesi Online. Ini bukan bukti provider sehat. SENT hanya diberikan setelah sukses terkonfirmasi. DELIVERED/READ tidak dibuat tanpa receipt provider. ID tg_... merupakan korelasi percobaan aplikasi, bukan ID pesan yang diklaim berasal dari provider.

## Konfigurasi server

Key persis dari record Doran Dev sudah disimpan di .env lokal yang diabaikan Git. SQL hanya dibaca sebagai data, tidak diimpor, dan database aplikasi asal tidak diubah. Saat deployment gunakan secret/environment server; .env lokal tidak ikut deployment. .env.example memakai placeholder.

```dotenv
TELEGRAM_BASE_URL=https://tele.jeblast.com
TELEGRAM_API_KEY=REPLACE_WITH_PROVIDER_API_KEY
TELEGRAM_ENABLED=false
TELEGRAM_TEST_MODE=true
TELEGRAM_TEST_PHONE=
DISPATCH_QUEUE_ENABLED=true
TELEGRAM_SUCCESS_FIELD=
TELEGRAM_SUCCESS_VALUE_JSON=true
# Opsional, hanya untuk helper server:
TELEGRAM_DEVICE_ID=
```

Isi nomor uji dan aktifkan TELEGRAM_ENABLED=true saat siap mengirim nyata. Mode uji tetap mengirim pesan nyata. Recipient dialihkan saat enqueue dan disimpan di job; worker menerapkan mode uji lagi sebelum reservasi kuota. Menonaktifkan mode uji tidak mengembalikan nomor asli pada job uji yang sudah tersimpan. Suppression memeriksa nomor yang benar-benar menerima pesan.

Jalankan server aplikasi biasa (npm run dev atau proses produksi). Worker dispatch bersama berjalan di server. Tidak perlu worker/Bull/Redis Telegram terpisah; TELEGRAM_QUEUE_ENABLED/TELEGRAM_REDIS_* versi awal tidak dipakai lagi. Jika antrean bersama nonaktif, pengiriman Telegram ditolak agar tidak melewati aturan. Restart sesudah mengubah environment.

## Contoh penggunaan

```http
POST /api/send-message
Authorization: Bearer TOKEN_PERANGKAT_TELEGRAM
Content-Type: application/json

{
  "number": "081234567890",
  "message": "Permintaan unlock harga untuk nota #123",
  "transaction_id": "unlock-123",
  "store_id": "kasir-1"
}
```

Token user juga didukung, dengan device_id miliknya. Token/device_id menentukan kanal; channel opsional harus cocok dengan perangkat. Untuk gambar, gunakan image URL/base64 pada send-message atau media_id File Manager pada send-media. Cek hasil dengan job_id/id/transaction_id di /api/send-status. Queued belum berarti terkirim.

```ts
import { enqueueTelegram } from "@/server/telegram/queue";
await enqueueTelegram("081234567890", "Permintaan unlock harga untuk nota #123");
```

Helper server membutuhkan TELEGRAM_DEVICE_ID untuk memilih pemilik/kebijakan. sendTelegram() juga mendelegasikan ke antrean bersama. Argumen ketiga helper adalah URL gambar; pesan sekaligus caption, sama seperti WhatsApp. Adapter internal createTelegramService menerima caption terpisah dan dipakai worker setelah pengamanan bersama.

Nomor 08... menjadi +628..., peer_type selalu user. HTTPS native Node memakai JSON.stringify, timeout koneksi/TLS 10 detik, timeout total 60 detik, dan tidak mengikuti redirect. Key hanya berada di header X-API-KEY server.

## Gambar privat

Provider memerlukan APP_URL HTTPS publik. Worker memverifikasi gambar/ukuran/kepemilikan dan membuat link /api/telegram/media/[id] bertanda tangan HMAC dari SETTINGS_ENCRYPTION_KEY, hash payload, dan expiry 10 menit. Link kedaluwarsa/diubah/untuk job berbeda ditolak. Tidak membuka direktori File Manager dan tidak mengirim API key lewat URL. APP_URL localhost HTTP tidak dapat diakses provider.

## Respons dan retry

Dokumentasi/contoh sukses belum tersedia dan belum ditemukan lewat akses publik. Tidak ada skema sukses provider yang dikarang. Selama TELEGRAM_SUCCESS_FIELD kosong, 2xx tanpa penolakan eksplisit menjadi UNCERTAIN/unrecognized_response. Isi field dan nilai JSON hanya setelah provider mengonfirmasi. Path bertitik didukung; contoh generik data.accepted + true bukan klaim tentang respons provider ini.

Penanda false pada success/ok/result/status, status failed/error/failure, error nonkosong, error_code bukan nol, dan HTTP error ditolak. Key invalid/penerima tak ditemukan tidak diulang.

HTTP 420/error flood dapat diulang maksimal 3 percobaan jika durasi provider dapat dibaca. Retry-After menerima detik/tanggal HTTP. Asumsi eksplisit: retry_after dan parameters.retry_after JSON adalah detik, masih perlu dikonfirmasi provider. Header didahulukan; durasi hilang/tidak valid/terlalu besar tidak ditebak. Minimum 1 detik. Delay disimpan di nextAttemptAt dan lease sender; retry tetap melewati semua aturan kuota/jam/jeda/opt-out.

Timeout, gangguan jaringan, respons ambigu, atau worker terhenti setelah claim menjadi UNCERTAIN tanpa retry otomatis. Retry ACK WhatsApp tidak diterapkan ke Telegram karena kontrak idempotency/receipt berbeda. Rekonsiliasi penerima sebelum retry manual; exactly-once tidak bisa dijamin tanpa dukungan provider.

Log Pino di WEBSITE_LOG/telegram.log, dispatch.lastError, riwayat percobaan dan webhook mencatat status/alasan tetap serta ID korelasi. Tidak memuat key, nomor, pesan, URL media, raw respons atau raw request error.

## Database dan penerapan

Tidak ada tabel konfigurasi baru. Migrasi additive 20261024070000_device_channel menambah phones.channel dengan default whatsapp; perangkat lama tetap WhatsApp. Migrasi masuk allowlist checksum deployment yang sudah ada. Jalur produksi tetap mensyaratkan backup database dan storage.

Kolom kanal sudah diterapkan pada database tujuan lokal 127.0.0.1/wa_local setelah akses localhost yang dibatasi sandbox diizinkan. Seluruh 62 perangkat lama tetap memakai WhatsApp. Launcher Jalankan Lokal.cmd juga memastikan kolom tersedia sebelum menjalankan server. Bootstrap hanya mengizinkan wa_local di localhost, menyimpan snapshot DDL phones di storage/local/schema-backups dan menjalankan statement additive dengan checksum yang disetujui. Tidak menyentuh database asal. npm run dev langsung memerlukan schema sudah diperbarui.

## Verifikasi offline

- verify-telegram.cjs: 59 pemeriksaan mock HTTP native, payload/header, timeout, nomor/media/error/flood dan log aman.
- verify-telegram-dispatch.cjs: 92 pemeriksaan worker/seleksi sender/reserveSend asli dengan DB memori dan HTTP mock; kuota/reset/jam/warmup/adaptive/jeda/pause/blokir/retry/routing kanal/signed media.
- verify-test-send-types.cjs: endpoint test kirim kedua kanal, scope pemilik, kompatibilitas WhatsApp dan penolakan fitur Telegram yang belum didukung.
- verify-local-device-channel.cjs: isolasi target, backup DDL, checksum dan idempotensi dengan database mock.
- node deployment/ci-tests.cjs: seluruh suite regresi offline lulus.
- Pemeriksaan TypeScript (tsc --noEmit): lulus. Build Next.js final berhasil mengompilasi kode, lalu gagal pada pengumpulan halaman karena EMFILE (batas file terbuka Windows), termasuk setelah percobaan dengan graceful-fs. Build produksi final belum dapat dinyatakan lulus.

Tidak ada pesan nyata yang dikirim selama implementasi dan pengujian.
