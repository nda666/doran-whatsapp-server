# Webhook kasir, 11 Oktober 2026

Endpoint: `POST https://kasir.doran.id/api/webhooks/jeblast/wa-phone`.
Authorization menggunakan salinan token API nomor `6281217357535`, disimpan di pengaturan webhook dashboard; nilai token tidak disimpan di source.
Pengirim menyertakan `Authorization: Bearer <token>`, `Content-Type: application/json`, `Accept: application/json`, dan `X-Jeblast-Event-Id`.

Header Accept diterapkan pada source dan compiled custom-server transport. Uji regresi webhook dengan mock HTTP lulus di lokal dan VPS. Dashboard siap setelah restart; proses Telegram tidak berubah.
Backup source, compiled transport, pengujian dan dokumentasi: `/home/jeblast/backups/doran-webhook-cashier-20261011-1791654023573`.

Webhook diaktifkan melalui dashboard; event `device.webhook.test` dimasukkan ke antrean untuk memeriksa penerimaan kasir. Endpoint kasir merespons HTTP 404 dengan pesan `The route api/webhooks/jeblast/wa-phone could not be found.`. Pemeriksaan server memastikan kunci webhook cocok dengan token nomor autentikasi. Webhook kemudian dinonaktifkan kembali dan event pending dibatalkan; URL/kunci tetap tersimpan. Aktivasi dan tes ulang menunggu route kasir tersedia di produksi.
Kunci webhook adalah salinan; jika token nomor autentikasi digenerate ulang, perbarui kunci webhook agar sesuai dengan token kasir.

## Perbaikan penerima kasir

Penerima kasir diperbaiki agar event `device.webhook.test` dengan `device: null` mendapat HTTP 200 tanpa mengubah WA Phone atau Store. `changed_fields` dibuat opsional sesuai kontrak pengirim; event perangkat biasa tetap memerlukan identitas perangkat dan nomor. Delapan tes dengan 45 assertions lulus di workspace kasir.

Dua file PHP diterapkan ke `/home/dory8752/public_html/new-kasir-dev` setelah baseline produksi cocok dan lint PHP 8.1 lulus. Backup: `/home/dory8752/backups/kasir-webhook-test-20261010-175913`.

Tes produksi dari dashboard Jeblast pada 11 Oktober 2026 pukul 01:00:19 WIB berhasil `DELIVERED` pada percobaan pertama. Webhook kini aktif. Screenshot: `output/webhook-kasir-delivered.jpg`.
