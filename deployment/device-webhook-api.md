# Webhook perubahan perangkat ke kasir

Konfigurasi: Admin Panel → Webhook Perangkat (admin utama). Isi Webhook URL Kasir HTTPS publik, kunci minimal 16 karakter, aktifkan, dan Simpan Webhook. URL dan kunci belum diisi saat deployment; fitur nonaktif sampai dikonfigurasi. Kunci dibuat melalui Buat Kunci atau ditentukan oleh pemilik, dan perlu disalin untuk kasir sebelum disimpan. API tidak pernah mengembalikan kunci yang tersimpan.

POST JSON dikirim dengan `Authorization: Bearer <kunci>`, `Content-Type: application/json`, `Accept: application/json`, dan `X-Jeblast-Event-Id: <UUID>`. Kasir harus memvalidasi kunci. QR dan sesi WhatsApp tidak disertakan.

Endpoint kasir: `https://kasir.doran.id/api/webhooks/jeblast/wa-phone`. Isi kunci autentikasi dengan token API saat ini milik nomor `6281217357535` (tanpa awalan `Bearer`; pengirim menambahkannya). Kunci tersimpan sebagai salinan, sehingga perlu diperbarui jika token nomor tersebut dibuat ulang. Jangan simpan nilai token di source atau dokumentasi.

```json
{
  "event_id": "UUID-event-stabil-saat-retry",
  "sequence": 123,
  "event": "device.token_rotated",
  "occurred_at": "2026-10-10T12:00:00.000Z",
  "changed_fields": ["token"],
  "device": {
    "id": "UUID-device",
    "user_id": "UUID-pemilik",
    "name": "Kasir Cabang A",
    "number": "6281234567890",
    "account_name": "Cabang A",
    "active": 1,
    "token": "TOKEN-API-TERBARU",
    "is_save_group": false,
    "webhook_url": null,
    "read_receipt": false,
    "reject_call": false,
    "show_online": true,
    "show_typing": false
  },
  "owner": { "id": "UUID-pemilik", "name": "Pemilik", "email": "owner@example.com" }
}
```

Events: `device.created`, `device.updated`, `device.deleted`, `device.active_changed`, `device.token_rotated`. Edit identik tidak memicu event. Generate massal menghasilkan satu event per device. Perubahan nomor/nama akun dari koneksi WhatsApp juga termasuk device.updated; perubahan online/offline tidak memicu event. `device.webhook.test` berisi device=null, owner=null dan message tes; bukan perubahan perangkat.

Kasir menggunakan device.id sebagai identitas. Untuk created/updated/active_changed/token_rotated, lakukan upsert snapshot device. Untuk deleted, hapus/nonaktifkan berdasarkan device.id. Gunakan event_id untuk deduplikasi; simpan sequence terakhir per device dan abaikan sequence yang lebih kecil/sama. Pengiriman setidaknya sekali: response hilang atau server restart dapat menghasilkan duplikat. Kasir harus mengembalikan 2xx setelah event disimpan secara durable. Respons bukan perintah untuk mengirim pesan WhatsApp.

Perubahan device dan outbox disimpan atomik. Antrean global FIFO menjaga urutan; satu endpoint kasir yang gagal akan menahan event berikutnya selama retry. Maksimal 8 percobaan dengan jeda meningkat (5 detik, 15 detik, 45 detik, dst., maksimum 1 jam), serta umur event maksimum 24 jam. Pengiriman memakai batas waktu HTTP 10 detik, menolak alamat privat dan redirect. Setelah batas retry, status FAILED; periksa riwayat dan sinkronkan perangkat tersebut dari data terbaru. Payload token dihapus segera setelah DELIVERED/FAILED/CANCELLED; metadata riwayat dihapus setelah 30 hari.

Mengubah URL/kunci, menonaktifkan, atau mengaktifkan kembali membuat revision baru dan membatalkan event lama yang masih antre. Request yang sudah berjalan dapat selesai ke tujuan sebelumnya. Tidak ada pengiriman ulang data seluruh device saat aktivasi; webhook berlaku untuk perubahan berikutnya. Gunakan direktori nomor API yang sudah tersedia jika kasir memerlukan sinkronisasi awal.

Tes Webhook Tersimpan memasukkan satu event tes ke antrean, menggunakan URL/kunci yang telah disimpan. HTTP 202 dari tombol hanya berarti masuk antrean; lihat DELIVERED pada riwayat untuk memastikan endpoint memberi respons 2xx. Pemasangan fitur tidak mengirim data perangkat ke URL eksternal mana pun.
