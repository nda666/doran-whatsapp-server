# Deployment seluruh pengiriman dan inventory nomor

Aktif 13 Oktober 2026. Build `LCjRf7joIr4cCnCBr1ifA`.

Backup privat VPS: `/home/jeblast/backups/doran-all-senders-auth-1791830203`.

Seluruh endpoint pengiriman publik/legacy dan status menerima token device atau token user + device_id miliknya. Tambahan tahap ini: media, sticker, poll, button, list, location, vcard, group, attachment; aliases public tetap didukung. Lampiran multipart/form-data, grup POST, status/antrean tetap sama.

list-phones dan phone-detail menerima Bearer token user tanpa device_id serta token device lama. User biasa scope own, admin utama scope all, mengikuti registeredPhones existing. QR tetap tidak diekspor; token device tetap hanya untuk admin utama. Hasil data[].id dapat dipakai sebagai device_id untuk pengiriman. Endpoint management session/QR/check-number/disconnect tetap device-only.

Verifikasi lulus: lint, TypeScript, semua test payload/transport tiruan/inventory, response-parity lama, build produksi. Live mencakup semua alias pengiriman antrean dengan GET/JSON/form dan replay terminal, grup/lampiran inactive dengan multipart, pembatasan own-device, daftar/detail normalisasi nomor dengan token user tanpa device_id, scope admin utama versus user biasa, serta Postman downloads. Fixture user/device/dispatch dihapus secara tepat; tidak mengirim WhatsApp atau mengubah perangkat existing.

API Docs menampilkan device_id dan contoh user-token pada seluruh detail pengiriman; inventory memiliki penjelasan tanpa device_id. Katalog memiliki 48 operasi; Postman 106 request termasuk varian user-token. Environment tetap tidak menyimpan kredensial. Tidak ada migrasi atau rotasi token existing.
