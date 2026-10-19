# API nomor WhatsApp terdaftar

Status: deployed live on 10 October 2026 at https://dashboard.jeblast.com. Production build: `zvZncL5M9aUNI0n9bjNzA`.

Pembaruan lokal 10 Oktober 2026: respons admin utama pada kedua endpoint kini menyertakan `data[].token` (Token API device). Pembaruan token ini sudah di-deploy ke produksi dan diverifikasi melalui HTTPS untuk GET/POST kedua endpoint; list-phones mengembalikan 68 device dengan field token. Build: `DdfEC9tbn8ULBzEVi3W9i`.

Base URL: `https://dashboard.jeblast.com`.

Gunakan token API device milik akun yang sudah disetujui. Server mencari device berdasarkan token, lalu memeriksa akun pemiliknya di database. Admin utama sesuai aturan aplikasi (`admin@gmail.com`, role `ADMIN`, approvalStatus `APPROVED`) mendapat semua device lintas akun; pengguna lain hanya mendapat device miliknya. Role ADMIN pada akun lain tetap memiliki cakupan sendiri sesuai kebijakan `src/lib/access.ts`. Parameter role/scope/admin dari klien tidak bisa menambah hak akses.

Respons menyertakan `access: { role: "ADMIN", scope: "all" }` untuk admin utama atau `access: { role: "USER", scope: "own" }` untuk pengguna biasa. Pada cakupan admin, setiap device juga menyertakan `userId` dan `user: { id, name, email }`. Field `token` (Token API device) hanya disertakan untuk admin utama. Password, token pengguna, dan QR tidak ditampilkan. Device yang dipakai untuk autentikasi boleh nonaktif/offline. Tidak memerlukan koneksi WhatsApp, tidak mengirim pesan, dan tidak membutuhkan perubahan schema/migration.

## 1. Semua device

```bash
curl -X POST https://dashboard.jeblast.com/api/public/list-phones \
  -H 'Authorization: Bearer TOKEN_DEVICE' \
  -H 'Content-Type: application/json' \
  -d '{}'
```

Respons: `{ "result": true, "total": 1, "data": [{...}] }`.

Tanpa pagination/batas jumlah; mencakup device belum tertaut (`number: null`). Akun tanpa device menghasilkan `total: 0, data: []` jika dipanggil oleh internal helper; token device yang sudah dihapus tidak lagi dapat digunakan untuk autentikasi.

## 2. Detail satu nomor

```bash
curl -X POST https://dashboard.jeblast.com/api/public/phone-detail \
  -H 'Authorization: Bearer TOKEN_DEVICE' \
  -H 'Content-Type: application/json' \
  -d '{"number":"081217357535"}'
```

Respons: `{ "result": true, "number": "6281217357535", "total": 1, "data": [{...}] }`.

Format 08…, 62…, +62…, spasi, tanda hubung, tanda kurung diterima. Bila satu nomor dimiliki beberapa device, `data` berisi seluruh device yang cocok dalam cakupan hak akses pemilik token: semua akun untuk admin utama, akun sendiri untuk pengguna lain.

Keduanya juga menerima GET dengan header Bearer. Parameter detail diberikan sebagai `?number=6281217357535`; tanda + harus di-URL-encode. POST dapat memakai `api_key` dalam JSON sebagai alternatif Bearer.

Setiap detail mencakup `id`, `name`, `number`, `account_name`, `status`, `isOnline`, `active`, `is_save_group`, `webhookUrl`, `readReceipt`, `rejectCall`, `showOnline`, `showTyping`, `createdAt`, `updatedAt`. `name` adalah Label perangkat; `account_name` adalah Nama Akun WA. Token API dan QR tidak dikembalikan. Waktu diserialisasi sebagai ISO 8601 UTC. Status adalah catatan terakhir database, bukan pemeriksaan koneksi langsung.

Error: 400 nomor invalid, 401 autentikasi invalid, 403 akun belum disetujui/ditolak, 404 nomor tidak ada dalam akun, 405 metode selain GET/POST, 500 kegagalan query detail. Respons memiliki `Cache-Control: no-store`.

## Validasi lokal

`node deployment/verify-registered-phones.cjs` menguji pembatasan pemilik, token/QR tidak terekspos, daftar lengkap/kosong, nomor duplikat, normalisasi, GET/POST, api_key/Bearer, penolakan token/akun/input/metode invalid, kegagalan database, dan akses ketika device nonaktif/offline serta WhatsApp dinonaktifkan. Database dan transport seluruhnya dimock; tidak ada pesan WhatsApp dikirim.

TypeScript dan ESLint untuk file berubah lulus. File aplikasi untuk deployment: `src/server/registeredPhones.ts`, `src/pages/api/public/[action].ts`, `src/pages/dashboard/api-docs.tsx`. Ikuti staging build dan backup/rollback runtime pada `deployment/README.md` sebelum mengganti build produksi.

## Deployment dan verifikasi live

Build Linux produksi dan regresi API lulus pada staging yang disalin dari source live terbaru. Source awal dan build ID diperiksa sebelum promosi untuk mencegah penimpaan perubahan deployment lain. Runtime dan source sebelumnya tersimpan di `/home/jeblast/backups/doran-registered-phones-20261010`, dengan rollback otomatis bila verifikasi promosi gagal. Tidak ada migration database.

Verifikasi HTTPS publik berhasil untuk GET/POST kedua endpoint, jumlah/urutan device dibandingkan dengan database pemilik, pembatasan pemilik, token/QR tidak terekspos, Cache-Control no-store, dan penolakan nomor/token invalid. HTML dan JavaScript API Docs menampilkan dua endpoint baru dan cocok dengan build produksi. Delapan halaman terautentikasi dan tiga belas API dashboard lulus pemeriksaan read-only. Jumlah device tetap 68, aktif 65, online 16; WhatsApp dan antrean dispatch tetap aktif. PID telegram-sender tidak berubah.

Pengujian terpisah dari komputer Windows melalui HTTPS publik juga lulus: GET/POST list-phones masing-masing menghasilkan 68 device; GET/POST phone-detail masing-masing menghasilkan satu device untuk nomor yang diuji. Token hanya digunakan dalam memori proses dan tidak dicetak/disimpan. Tidak ada pesan WhatsApp dikirim.

## Revisi cakupan admin

Deployed live 10 October 2026. Both endpoints use the existing designated super-admin rule from src/lib/access.ts. API responses now expose access.role/access.scope and admin rows include owner id/name/email only. Offline tests cover normal-user isolation, administrator all-owner access, ADMIN accounts outside the designated email, USER accounts with the designated email, rejected admin accounts, and client role/scope spoofing. Production staging build passed. Public GET/POST returned scope=all and all 68 devices for the designated admin; docs HTML/JS and eight authenticated pages/thirteen dashboard APIs passed. Backup: /home/jeblast/backups/doran-registered-phones-admin-20261010. Database unchanged; no test WhatsApp messages sent.
