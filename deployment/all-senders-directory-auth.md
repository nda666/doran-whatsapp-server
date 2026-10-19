# Seluruh API pengiriman dan daftar/detail nomor

Seluruh send-message (termasuk public/v2), send-media, send-sticker, send-poll, send-button, send-list, send-location, send-vcard, send-group-message, send-attachment, dan send-status menerima token device lama atau Bearer token user + device_id miliknya. Alias public yang sudah tersedia tetap memakai handler yang sama. Input JSON/form/GET mengikuti metode lama; grup hanya POST, lampiran tetap multipart/form-data dengan device_id pada field form. Respons/antrean/deduplikasi tidak diganti; grup dan lampiran tetap pengiriman langsung.

list-phones/phone-detail menerima Bearer token user langsung tanpa device_id, atau token device lama. User biasa mendapat scope own tanpa token/QR; admin utama mendapat scope all beserta token device sesuai hak akses existing, tanpa QR. phone-detail tetap mencari number (nomor WhatsApp), bukan device_id. data[].id pada hasil daftar adalah device_id untuk pengiriman. Parameter role/admin dari klien tidak menambah akses.

Token user tidak bisa memilih device orang lain untuk pengiriman, termasuk token admin. Media tetap milik owner device. Kredensial berbeda dalam satu request ditolak, device_id yang tidak cocok dengan token device ditolak, akun nonaktif/pending ditolak, dan pengiriman baru harus memakai device aktif. Replay antrean job_id existing tetap dapat dibaca dari device nonaktif. Lampiran dengan field kredensial berulang dan berbeda ditolak.

Endpoint session, generate-qr, check-number, disconnect tetap device-only. Dukungan user token di inventory tidak memberi akses pengiriman lintas owner kepada admin.

API Docs menampilkan tabel device_id dan contoh user-token pada setiap API pengiriman. Untuk daftar/detail nomor, docs menjelaskan bahwa device_id tidak dibutuhkan. Postman menambahkan semua varian user-token (JSON/form/GET/multipart) tanpa menghapus request device-token lama. Semua environment ekspor tetap kosong dari kredensial.

Pengujian lokal memakai database/transport tiruan, mencakup validasi payload media/interactive, pemilihan owner/phone di grup/lampiran, multipart dan konflik kredensial, serta akses inventory. Pengujian live memakai device inactive tanpa pasangan WhatsApp dan satu dispatch terminal FAILED: pengiriman antrean hanya replay; grup/lampiran ditolak 409 sebelum transport. User/device/catatan uji dihapus berdasarkan ID/prefix yang tepat. Tidak mengirim pesan WhatsApp atau mengubah perangkat existing.

Tidak membutuhkan migrasi atau pergantian token existing.
