# Token user + device_id untuk kirim pesan dan cek status

Tahap pertama: `/api/send-message`, `/api/public/send-message`, `/api/v2/send-message`, `/api/public/v2/send-message`, `/api/send-status`, dan `/api/public/send-status`.

Integrasi token device tetap dapat menggunakan Bearer atau `api_key` body/form/query tanpa `device_id`. Alias `token_api` juga diterima pada tahap ini. Format respons, status sukses HTTP 200, job_id, antrean, deduplikasi, dan pencarian status tetap sama. Invalid token pada send-message tetap menghasilkan HTTP 200 + result=false; send-status tetap HTTP 401.

Tambahan: Bearer token user wajib `device_id` miliknya sendiri, termasuk untuk administrator utama. Format JSON, form-urlencoded, dan GET tersedia sesuai endpoint lama. Device offline tetap dapat memakai antrean; replay job_id tetap tidak membuat job/pesan baru. Status pengiriman tetap dibatasi pada satu device yang dipilih.

Perubahan yang disengaja: kredensial berbeda pada header/body/query ditolak 400; sebelumnya header Bearer diprioritaskan. Kredensial identik berulang tetap diterima. device_id yang disertakan bersama token device harus cocok (403 jika berbeda). Akun pemilik harus aktif dan disetujui. Status baca/replay masih dapat dilakukan untuk device nonaktif; pengiriman baru tetap ditolak jika device nonaktif. API pengiriman lain tetap device-only.

Tidak ada token lama yang diganti atau diwajibkan migrasi. Integrasi normal dengan satu token device tetap bekerja. Integrasi yang mencampur token berbeda atau mengandalkan akun tidak aktif/pending akan ditolak sesuai aturan akses baru di atas.

Contoh:

```bash
curl -X POST 'https://dashboard.jeblast.com/api/send-message' \
  -H 'Authorization: Bearer TOKEN_USER' \
  -H 'Content-Type: application/json' \
  -d '{"device_id":"UUID_DEVICE","number":"6281234567890","message":"Halo","job_id":"ORDER-001"}'

curl -X POST 'https://dashboard.jeblast.com/api/send-status' \
  -H 'Authorization: Bearer TOKEN_USER' \
  -H 'Content-Type: application/json' \
  -d '{"device_id":"UUID_DEVICE","job_id":"ORDER-001"}'
```

Docs web dan koleksi/environment Postman menambahkan contoh token user; environment unduhan tidak menyimpan kredensial. PDF lama tetap merupakan contoh integrasi device yang masih didukung.

Tes lokal: `verify-dual-dispatch-auth.cjs`, `verify-send-response.cjs`. Tes live: `verify-dual-dispatch-auth-live.cjs` memakai user/device sementara yang tidak aktif/tidak dipasangkan dan satu dispatch terminal FAILED. Seluruh request kirim hanya mengulang job terminal atau dry_run. Tidak mengirim WhatsApp, tidak mengubah user/device yang ada, lalu membersihkan fixture persis berdasarkan ID/prefix.
