# Webhook status antrean ke kasir

Admin utama membuka **Admin Panel → Webhook Status Pengiriman**. Tersedia satu input URL HTTPS, kunci autentikasi, sakelar aktif, tombol simpan, tombol tes, dan 20 riwayat pengiriman terakhir. URL awal kosong dan webhook nonaktif; isi nanti saat endpoint kasir siap.

Event `dispatch.status_changed` dibuat saat pekerjaan antrean API/campaign pertama kali masuk `QUEUED` dan saat status berubah ke `PROCESSING`, `SENT`, `DELIVERED`, `READ`, `FAILED`, atau `UNCERTAIN`. Status identik, retry request yang terdeduplikasi, receipt duplikat, dan pembaruan lease tidak menghasilkan event. Isi pesan, gambar, token perangkat, dan sesi WhatsApp tidak disertakan.

Perubahan pekerjaan dan event outbox disimpan dalam transaksi yang sama. Sender webhook berjalan di custom server, menggunakan transport HTTP yang sama dengan webhook perangkat. Worker webhook tetap berjalan saat koneksi WhatsApp dinonaktifkan.

Request: POST JSON dengan `Content-Type: application/json`, `Accept: application/json`, `Authorization: Bearer <kunci>`, dan `X-Jeblast-Event-Id: <event_id>`.

```json
{
  "event_id": "UUID-event",
  "sequence": 123,
  "event": "dispatch.status_changed",
  "occurred_at": "2026-10-11T03:00:00.000Z",
  "previous_status": "SENT",
  "dispatch": {
    "id": "UUID-pengiriman",
    "job_id": "ID-request-dari-kasir",
    "device_id": "UUID-perangkat",
    "user_id": "UUID-pemilik",
    "transaction_id": "TRX-123",
    "store_id": "CABANG-01",
    "message_key": "struk",
    "campaign_id": null,
    "source": "API",
    "recipient": "6281234567890",
    "status": "DELIVERED",
    "message_id": "ID-pesan-WhatsApp",
    "attempts": 1,
    "error": null,
    "created_at": "2026-10-11T02:59:57.000Z",
    "updated_at": "2026-10-11T03:00:00.000Z",
    "sent_at": "2026-10-11T02:59:59.000Z",
    "delivered_at": "2026-10-11T03:00:00.000Z",
    "read_at": null
  }
}
```

`dispatch.id` mengidentifikasi satu penerima. Satu `job_id` dapat memiliki beberapa penerima. `job_id` null untuk campaign, request tanpa job_id, dan pekerjaan lama sebelum kolom `clientJobId` tersedia. `previous_status` null pada event QUEUED pertama. Tanggal memakai ISO 8601 UTC. Receipt bisa langsung menaikkan status ke DELIVERED/READ tanpa melalui semua status antara.

Kasir memvalidasi Bearer dan menyimpan event sebelum merespons 2xx. Deduplikasi memakai `event_id`; simpan sequence terakhir **per dispatch.id**, abaikan sequence lebih kecil/sama. Nilai sequence stabil saat retry. Sequence bukan jumlah event tanpa celah dan tidak berkaitan dengan sequence webhook perangkat.

Pengiriman setidaknya sekali: respons hilang atau restart bisa menghasilkan duplikat. FIFO global; event yang menunggu retry menahan event berikutnya. Maksimal 8 percobaan dan umur 24 jam; jeda 5 detik, 15 detik, 45 detik, dst. maksimal 1 jam. Setelah batas ini event FAILED, event berikutnya dapat diproses. Riwayat membantu mengidentifikasi pengiriman yang perlu direkonsiliasi lewat `/api/send-status`.

Timeout HTTP 10 detik, timeout DNS 5 detik, alamat privat dan redirect ditolak. Payload dibersihkan setelah DELIVERED/FAILED/CANCELLED; metadata dibersihkan setelah 30 hari. Mengubah URL/kunci atau mengubah aktivasi membatalkan event pending sebelumnya. Request yang sudah berjalan bisa selesai memakai konfigurasi lama. Aktivasi berlaku untuk perubahan berikutnya, tanpa mengirim ulang seluruh pekerjaan lama.

Tombol tes mengantrekan `dispatch.webhook.test` dengan `dispatch: null` dan `previous_status: null`. Kasir harus menerima event ini tanpa memperbarui transaksi. Respons tombol 202 berarti masuk antrean; status DELIVERED pada riwayat berarti endpoint memberi 2xx.

API pengaturan admin: GET/POST `/api/admin/dispatch-webhook`. POST pengaturan `{ "enabled": false, "url": "", "secret": "opsional-minimal-16-karakter" }`; kosongkan/omit secret untuk mempertahankan kunci lewat form. API menerima secret jika diganti dan tidak mengembalikan nilainya. POST tes `{ "action": "test" }`.

## Penerapan

Perubahan ini disiapkan dan diuji pada workspace lokal. Sebelum menjalankan source baru di server, terapkan migration `20261011130000_dispatch_status_webhook`, generate Prisma Client, build, kemudian restart custom server. Migration menambahkan kolom nullable `clientJobId` dan dua tabel webhook; konfigurasi awal nonaktif. Cadangkan database dan runtime sesuai prosedur deployment sebelum penerapan.

```sh
npx prisma migrate deploy
npx prisma generate
npm run build
```

Pengujian lokal: `node deployment/verify-dispatch-webhook.cjs`, `node deployment/verify-request-job-id.cjs`, dan `node deployment/verify-device-webhook.cjs`. Tes webhook menggunakan mock database/HTTP, tanpa mengirim pesan WhatsApp atau request ke kasir. TypeScript source aplikasi lulus menggunakan `tmp/tsconfig.dispatch-webhook-check.json`; pemeriksaan tsconfig utama masih terkena file backup lama di `tmp/job-id-live-before/queue.ts`. Belum ada pengujian database nyata atau endpoint kasir untuk fitur baru ini.
