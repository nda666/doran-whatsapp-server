# Tes endpoint status kasir

Endpoint: `https://kasir.doran.id/api/webhooks/jeblast/dispatch-status`.
Tanggal: 11 Oktober 2026 (Asia/Jakarta).

User mengizinkan pengujian dengan kunci autentikasi webhook perangkat kasir yang sudah tersimpan. Kunci hanya dibaca di memori pada VPS Jeblast dan digunakan sebagai Bearer ke endpoint kasir; tidak dicatat pada source/output.

Hasil:

| Tes | Respons |
| --- | --- |
| Tanpa Authorization | HTTP 401, Token webhook tidak valid |
| Event `dispatch.webhook.test`, dispatch=null | HTTP 422, event dan dispatch ditolak validasi |
| Event sintetis `dispatch.status_changed`, status DELIVERED, job_id=null | HTTP 500, Server Error |

Event status: `5e45bb6b-bde8-4eb4-80ee-14018a225ee0`.
Dispatch sintetis: `701e732a-0d11-446a-98cf-246117555385`.
Event tombol tes: `dbb7a946-05a8-4376-9ed0-022067d27075`.

Payload status menyertakan seluruh field kontrak dengan UUID valid, waktu UTC, dan job_id=null untuk menghindari pencocokan pesan kasir. Tidak ada pesan WhatsApp yang dikirim. Tidak ada respons 2xx sehingga pemeriksaan duplicate/transport berikutnya tidak dijalankan.

Autentikasi lolos ke validasi/handler, tetapi endpoint belum berhasil menyimpan event.

Penyebab kemudian dikonfirmasi melalui log viewer produksi kasir, file `laravel-2026-10-11.log`, log index 2094, tanggal 11 Oktober 2026 pukul 12:52:38 WIB:

```text
SQLSTATE[42S02]: Base table or view not found: 1146
Table 'dory8752_from_local.xx_jeblast_dispatch_events' doesn't exist
Connection: mysql
```

SQL yang gagal adalah INSERT ke `xx_jeblast_dispatch_events` dengan event_id `5e45bb6b-bde8-4eb4-80ee-14018a225ee0` dan dispatch_id `701e732a-0d11-446a-98cf-246117555385`, cocok dengan tes. Tabel riwayat event belum tersedia pada database yang digunakan handler. Migration `2026_10_11_110000_create_jeblast_dispatch_webhook_tables.php` membuat tabel tersebut dan `xx_jeblast_dispatches`; perlu diterapkan manual di server kasir sesuai aturan proyek. Tidak ada migration atau perubahan kasir yang dijalankan dalam diagnosis ini.

Pengaturan Jeblast saat tes: URL endpoint sudah tersimpan, enabled=false, kunci status belum diisi. Tes menggunakan salinan kunci webhook perangkat yang tersedia, tanpa menyimpan kunci atau mengaktifkan webhook status. Pengaturan sebelum/sesudah tes dipastikan identik.

## Tes ulang setelah migration

User meminta tes ulang setelah migration kasir diterapkan. Hasil `dispatch.status_changed`: HTTP 200, result=true, updated=true, messages_updated=0. Event `8faba351-d955-4d48-9b6d-4ea726bbfbc1`, dispatch sintetis `b1f8af6f-aed7-46d2-8258-3c608c0a2af4`.

Pengiriman ulang event yang sama: HTTP 200, duplicate=true, updated=false, messages_updated=0. Transport webhook produksi Jeblast juga berhasil mengirim payload yang sama dan menerima 2xx. Tidak ada pesan WhatsApp yang dikirim atau pesan pelanggan yang diubah. Pengaturan tetap identik: webhook status nonaktif, URL sudah tersimpan, kunci status belum diisi.

Event tombol tes `dispatch.webhook.test` dengan dispatch=null masih HTTP 422; penerima kasir belum mendukung event tersebut. Event perubahan status biasa sudah berhasil.
