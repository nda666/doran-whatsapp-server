# Deployment token user + device_id

Aktif 13 Oktober 2026. Build `fk0oyE4cHk5IStZoj7uzJ`.

Backup VPS: `/home/jeblast/backups/doran-dual-dispatch-auth-1791828129`.

Tahap pertama berlaku untuk send-message dan send-status, beserta alias public/v2 yang sudah ada. Token device melalui Bearer/api_key tetap didukung tanpa device_id. Alias token_api tersedia. Token user melalui Bearer wajib device_id miliknya sendiri, termasuk akun admin utama. Tidak mengubah token existing, URL, struktur respons, antrean, atau deduplikasi.

Penolakan tambahan sesuai desain yang disepakati: token berbeda yang digabung pada satu request (400), device_id tidak cocok dengan token device (403), device milik akun lain (403), atau akun tidak aktif/belum disetujui (403). Integrasi lama dengan satu token device valid tetap didukung tanpa perubahan.

Lint, TypeScript sumber aplikasi, tes dual authentication dan response parity, serta build produksi lulus. Live menguji 4 alias pengiriman dengan JSON/form/GET/query/Bearer/api_key/token_api, dua alias status, token user dan device, kepemilikan/conflict/akun nonaktif, dry_run, dan replay. Seluruh fixture memakai device tidak aktif/tidak dipasangkan dan dispatch terminal FAILED. Tidak ada pesan WhatsApp dikirim atau dispatch baru dibuat melalui API; fixture dibersihkan.

Dokumentasi web menambahkan operasi/contoh user-token dan aturan akses; koleksi/environment Postman menambahkan folder Token user + Device ID dan variabel device_id. Unduhan publik diperiksa bebas kredensial. Keterangan utama koleksi Postman diperbarui lagi secara atomik setelah aktivasi, dengan backup dalam folder yang sama. PDF lama tetap menjadi contoh integrasi device.

Source API berada pada `src/server/dispatchAuth.ts`, `src/pages/api/send-message.ts`, dan `src/pages/api/send-status.ts`. Endpoint pengiriman lainnya belum mendukung token user.
