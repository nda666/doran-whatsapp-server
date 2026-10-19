# Upgrade Doran WA / Jeblast — 9 Oktober 2026

Upgrade telah dideploy ke https://dashboard.jeblast.com pada 10 Oktober 2026. Migration additive diterapkan, build Linux aktif, dan akun tunggal pemilik 68 perangkat mendapat role ADMIN. Verifikasi live: 8 halaman HTTPS terautentikasi dan 13 endpoint API berhasil, tidak ada migration pending, 68 perangkat tetap terdaftar (65 aktif, 16 online). Tidak ada pesan WhatsApp uji nyata yang dikirim. Backup database, storage/sesi, source, konfigurasi dan runtime lama: /home/jeblast/backups/doran-marketing-20261010. Telegram tetap berjalan dengan PID yang sama. Script deployment: deployment/deploy-marketing-20261010.py; verifikasi read-only: deployment/verify-marketing-live.cjs.

## A. Campaign / Blast

- Buat campaign dengan satu atau beberapa device aktif, pesan/caption, media tersimpan, kontak individual, grup phonebook, seluruh phonebook, atau nomor manual.
- Format nomor manual: satu baris `nomor|nama`; pemisah baris, koma, dan titik koma didukung. Nomor lokal Indonesia dinormalisasi. `{nama}` dan `{nomor}` diganti sebelum antrean dibuat. Target duplikat digabung; input manual mengungguli nama dari phonebook.
- Maksimal 10.000 penerima per campaign. Semua baris penerima dan metadata campaign dibuat dalam satu transaksi. Form memakai UUID tetap untuk retry; ID yang sama dengan isi berbeda ditolak.
- Jadwal disimpan sebagai waktu UTC; pemilih tanggal mengikuti zona waktu browser. Device dipilih round-robin dalam urutan yang dipilih; device offline tetap menunggu pada antreannya dan tidak memindahkan pesan yang hasilnya belum pasti.
- Status WAITING, PROCESSING, COMPLETED, PAUSED, CLEARED; polling daftar/riwayat setiap lima detik. COMPLETED berarti tidak ada penerima yang masih antre/proses, bukan semua berhasil. UNCERTAIN ditampilkan terpisah.
- Delay acak min–max berlaku per device melalui lease database; minimum satu detik. Jendela kedaluwarsa campaign memperhitungkan jumlah target/delay maksimum ditambah 24 jam toleransi. Jeda tidak menghabiskan masa antrean; resume memperbarui jendela itu.
- Pause/clear dan pengambilan job mengunci baris campaign yang sama. Pesan yang sudah masuk transport tidak dibatalkan; hasilnya tetap dicatat. Clear mengubah penerima QUEUED menjadi FAILED/CAMPAIGN_CLEARED dan mempertahankan riwayat. Clear bukan penghapusan database.
- Worker tetap menunggu ACK server WhatsApp. Gangguan ambigu menjadi UNCERTAIN; tidak otomatis dikirim ulang. Receipt dapat mengonfirmasi hasil kemudian. Delay/rotasi tidak menjamin akun bebas pembatasan.

File baru: `src/pages/dashboard/campaigns.tsx`, `src/pages/api/campaigns/index.ts`, `src/pages/api/campaigns/[id].ts`, `src/server/campaigns/prepare.ts`. File diubah: `src/server/dispatch/worker.ts`.

Routes: GET/POST `/api/campaigns`, GET/PATCH `/api/campaigns/:id`, halaman `/dashboard/campaigns`. PATCH body: `{ "action": "pause|resume|clear" }`.

Uji: buat campaign sintetis, ulangi delapan request dengan UUID yang sama, periksa dua target tetap dua baris; coba ID device/grup/kontak pengguna lain; jeda, resume, periksa delay lease; jadwalkan esok hari; clear; simulasi ACK hilang. Lihat `deployment/verify-marketing-upgrade.cjs`.

## B. Phonebook / Kontak dan Grup

CRUD kontak/grup, pencarian dan pagination database; kontak dapat berada di satu grup. Penghapusan grup melepaskan grup dari kontak dan mempertahankan kontaknya. Import CSV/Excel `.xlsx` memakai kolom `nama` dan `nomor`; nomor Excel sebaiknya berupa teks agar nol di depan tidak hilang. Maksimal 3 MB/10.000 baris per import. Pilih grup sebelum import. Nomor yang sudah ada dilewati; import tidak mengubah nama/grup kontak lama. Export CSV memakai filter saat ini dan mencegah formula spreadsheet aktif.

Kontak perangkat dari event Baileys contacts.upsert/update dicatat dalam `device_contacts`. Sync memindahkan kontak yang tersedia ke phonebook. Riwayat kontak sebelum fitur ini aktif atau identitas WhatsApp LID tanpa nomor tidak dapat diperoleh dari cache ini; gunakan import jika perangkat belum mengirim data kontak. Sync tidak memaksa logout atau memindai ulang QR.

File baru: `src/pages/dashboard/contacts.tsx`, `src/pages/api/contacts/{index,groups,sync}.ts`, `src/server/campaigns/{contacts,csv}.ts`. File diubah: `src/server/libs/makeWASocket.ts`.

Routes: GET/POST/DELETE `/api/contacts`, GET/POST/DELETE `/api/contacts/groups`, POST `/api/contacts/sync`, GET `/api/contacts?export=csv`, halaman `/dashboard/contacts`.

Uji: CRUD, duplicate import, grup milik pengguna lain ditolak, sync cache sintetis, nomor lokal/internasional, CSV dengan kutip/koma dan formula. Parser Excel: `read-excel-file` dengan kode import di browser, tidak menjalankan macro. Fixture XLSX `deployment/fixtures/contact-import.xlsx` juga diuji melalui upload browser; nomor lokal berhasil diimpor.

## C. File Manager

Upload gambar JPG/PNG/GIF/WebP, video MP4, audio MP3/OGG, PDF/DOC/DOCX/XLSX/TXT, maksimal 25 MB/file dan 1.000 file/pengguna. Metadata di MySQL; file di `storage/campaign-media`. Preview gambar/video/audio; dokumen diunduh. Copy URL menghasilkan URL yang tetap memerlukan autentikasi. Pengiriman memakai media_id sehingga worker membaca file lokal milik pemilik device, tanpa URL publik/token permanen.

File yang masih direferensikan riwayat/antrean ditolak saat dihapus. Kebijakan maintenance lama membersihkan payload terminal setelah masa retensinya, termasuk JSON dan referensi media. Audio dikirim sebagai audio; WhatsApp tidak menampilkan caption pada pesan audio.

File baru: `src/pages/dashboard/media.tsx`, `src/pages/api/media/{index,[id]}.ts`, `src/server/campaigns/media.ts`. File diubah: `deployment/maintenance.cjs`.

Routes: GET/POST `/api/media`, GET/DELETE `/api/media/:id`, halaman `/dashboard/media`. Pemilih campaign memakai `/api/media?options=1`.

Uji: upload/preview dengan pemilik; akses pengguna lain 404; file yang dipakai campaign tidak dapat dihapus; transport media hanya memakai fixture lokal.

## D. Dasbor Analitik

Cards jumlah device/limit/online, antrean/gagal/campaign aktif, paket/masa berlaku dan total pesan terkirim. Grafik tujuh atau 30 hari memakai data sentAt antrean (pengelompokan WIB). Pesan lama sebelum outbox aktif dan balasan otomatis di luar outbox tidak termasuk total pengiriman. Statistik auto-reply tersedia per rule.

File baru: `src/pages/api/dashboard-stats.ts`. File diubah: `src/pages/dashboard/index.tsx`.

Routes: GET `/api/dashboard-stats?days=7|30`, halaman `/dashboard`. Uji: statistik dua pengguna tidak bercampur; satu pesan yang ACK-nya berhasil dihitung SENT; UNCERTAIN dipisahkan.

## E. API Publik dan API Docs

Route baru `/api/public/:action`, method POST JSON, POST URL-encoded, atau GET. Autentikasi dengan `Authorization: Bearer TOKEN_DEVICE` atau `api_key`. Gunakan POST dan Bearer untuk produksi; token dalam query GET dapat tercatat di log proxy.

Actions: send-message, send-media, send-poll, send-sticker, send-button, send-list, send-location, send-vcard, generate-qr, disconnect, check-number, session. Semua send-* masuk outbox dan merespons 202; tidak mengirim di request. Sertakan store_id, transaction_id dan message_key stabil untuk dedupe. Poll/button/list/location/vcard memakai objek `payload` (JSON string pada URL-encoded/GET); media/sticker memakai media_id. Sticker harus file WebP. API lama `/api/send-message`, `/api/v2/send-message` dan `/api/send-status` tetap tersedia.

Tombol/list menggunakan protobuf legacy melalui kemampuan forward Baileys yang terpasang. Encoding/generation telah diuji offline; tampilan/delivery pada akun dan klien WhatsApp nyata belum diuji dan tidak dijamin oleh ACK transport. Check-number dan QR memerlukan koneksi WhatsApp diaktifkan. Disconnect menonaktifkan device terlebih dahulu agar reconnect berkala tidak membatalkannya.

Webhook URL per device menerima POST JSON event message.incoming dan mencatat keberhasilan/kegagalan pada inbox. Koneksi outbound memeriksa DNS/alamat tujuan, menolak alamat privat, tidak mengikuti redirect, dan memakai batas waktu 10 detik. Tidak ada retry webhook otomatis. Media incoming tetap mengikuti alur webhook rule lama; event perangkat baru mengirim metadata/teks/ID pesan.

File baru: `src/pages/api/public/[action].ts`, `src/pages/dashboard/api-docs.tsx`, `src/server/campaigns/content.ts`, `src/server/utils/sendDeviceWebhook.ts`. File diubah: `src/server/libs/makeWASocket.ts`, `src/server/dispatch/worker.ts`.

Routes: `/api/public/:action`, halaman `/dashboard/api-docs`. Uji: admission seluruh payload dengan handler asli/database lokal dan socket stub; retry/conflict; protobuf tombol/list melewati generateWAMessageContent Baileys; webhook privat ditolak. Tidak ada request generate-qr/check-number ke WhatsApp nyata.

## F. Device dan Auto-Reply

Device: pagination server-side 20 baris, counter outbox terkirim, webhook URL, read receipt, reject call, online presence dan typing. Edit mengubah pengaturan; online presence di konfigurasi socket berlaku setelah reconnect. Session Info menampilkan identitas/status tanpa credential. Pemilih device sidebar memberi default pengirim campaign dan filter antrean; pada halaman auto-reply, mengganti selector juga mengganti device yang dikerjakan.

Auto-reply: beberapa kata kunci dipisahkan `|`, text/image/button/list, delay 0–60 detik, quote pesan dan counter per rule. Keyword kosong tidak cocok untuk Equal/Contain; Any cocok semua. Rule inactive dilewati. Counter bertambah ketika sendMessage mengembalikan ID; ini bukan bukti delivery ke penerima. Penanganan quoted-message juga memakai sender yang sama untuk tipe non-webhook. Gambar lokal dibatasi pada unggahan device yang bersangkutan.

File diubah: `src/pages/api/phones/index.ts`, `src/pages/dashboard/phone.tsx`, `src/components/phone/{PhoneFormModal,PhoneTableButton}.tsx`, `src/lib/usePhoneData.ts`, `src/pages/api/auto_reply/index.ts`, `src/components/auto-reply/AutoReplyFormModal.tsx`, `src/pages/dashboard/auto-reply.tsx`, `src/types/components/IAutoReplyFormModal.ts`, `src/services/autoReply.ts`, `src/server/events/{handleMessageInEvent,handleQuotedMessageEvent}.ts`, `src/server/utils/messageKeywordTypeChecker.ts`. File baru: `src/server/campaigns/autoReply.ts`.

Routes: route device/auto-reply lama; GET `/api/phones?page=1&limit=20`, GET `/api/phones?options=1`. Uji: limit device, edit milik orang lain 404, paging, keyword, counter/quote/list dengan transport stub, regresi QR/pairing/Test Kirim.

## G. Admin Panel

Role USER/ADMIN disimpan di database dan diperiksa pada setiap API admin; tidak bergantung pada tampilan menu. Manage Users membuat/mengedit nama/email/password/role/limit/paket/masa berlaku. Password baru minimal 12 karakter dan bcrypt; daftar tidak mengekspos password atau token. Admin tidak dapat menurunkan role dirinya sendiri. Pembuatan device memakai lock pengguna dan mengecek limit terkini.

Server Settings menyimpan profil VPS/local/shared hosting, URL dan port. Status runtime menunjukkan versi Node/port proses yang menjawab. Ini bukan pemeriksaan server Node eksternal; konfigurasi runtime/environment dan restart diterapkan melalui deployment, bukan otomatis saat Save.

Generate Certificate memakai Certbot webroot di Linux saja; default disabled. Membutuhkan certbot pada PATH, izin yang sesuai, SSL_WEBROOT dan SSL_CERTBOT_ENABLED=true. Domain/email divalidasi dan command dijalankan tanpa shell. Sertifikat harus dipasang di web server; renewal memakai fasilitas Certbot. Untuk cPanel gunakan AutoSSL hosting. Pengujian hanya memverifikasi penolakan ketika fasilitas tidak tersedia; tidak menerbitkan sertifikat.

Halaman Update Sistem menampilkan versi aplikasi/runtime dan migration belum diterapkan. Tidak melakukan git pull/npm update/restart dari web. Instalasi update mengikuti langkah deployment di bawah.

File baru: `src/pages/dashboard/admin.tsx`, `src/pages/api/admin/{users,settings,update}.ts`. Routes: GET/POST `/api/admin/users`, GET/POST `/api/admin/settings`, GET `/api/admin/update`, halaman `/dashboard/admin`.

Uji: user biasa 403, data sensitif tidak masuk daftar, demosi diri ditolak, profil tersimpan, SSL unavailable 409, daftar migration kosong sesudah deploy database uji.

## H. Navigasi, Bahasa, Log dan Laporan

Sidebar ikon/label, breadcrumb, pencarian global pada device/kontak/campaign/media, tema gelap tersimpan pada browser. Locale id/en/es/ar/hi diaktifkan, file common.json dan upgrade.json terpisah, locale komponen Ant Design sesuai bahasa, dan RTL untuk Arab. Navigasi dan label utama fitur baru diterjemahkan; sebagian penjelasan teknis/validasi baru masih Indonesia, dan key legacy yang belum diterjemahkan memakai isi English. Bahasa default Indonesia.

Log memisahkan riwayat keluar dari inbox/webhook. Riwayat keluar mempunyai filter status/device/via Web atau API. Query inbox tidak lagi mengambil alih baris userId=NULL ketika dibuka pengguna; baris lama tanpa pemilik tetap tidak diperlihatkan sampai pemiliknya dipulihkan melalui proses data tersendiri. Laporan per periode/pengirim menampilkan ringkasan dan detail, dengan CSV maksimal 10.000 baris; persempit filter jika lebih besar. Periode laporan dihitung WIB; tanggal CSV secara eksplisit UTC.

File baru: `src/lib/{DashboardPreferences.tsx,useDashboardApi.ts}`, `src/pages/api/{search,reports}.ts`, `src/pages/dashboard/{search,reports}.tsx`, `public/locales/{id,en,es,ar,hi}/upgrade.json`, `public/locales/{es,ar,hi}/common.json`. File diubah: `src/components/Layout.tsx`, `src/pages/_app.tsx`, `next-i18next.config.js`, `src/pages/dashboard/{log,dispatch}.tsx`, `src/pages/api/{log/index,dispatch}.ts`, namespace locale halaman dashboard lama.

Routes: GET `/api/search?q=...`, GET `/api/reports?start=YYYY-MM-DD&end=YYYY-MM-DD&phoneId=...`, tambahkan `export=csv` untuk export; halaman `/dashboard/search`, `/dashboard/reports`, `/dashboard/log`.

Uji: pencarian/statistik/log/laporan terbatas pemilik, CSV aman, locale Spanyol render label campaign, browser tanpa pageerror, screenshot desktop dan mobile 390 px. Screenshot memakai fixture sintetis: `deployment/upgrade-*.png`.

## Migration, konfigurasi dan dependency

Migration additive: `prisma/migrations/20261009200000_marketing_upgrade/migration.sql`. Urutannya setelah migration durable dispatch. Tabel baru campaigns/contact_groups/contacts/media_assets/device_contacts/server_settings; kolom baru pada users/phones/auto_replies/wa_dispatches; indeks dan foreign key media/campaign/group. Collation tabel baru utf8mb4_bin agar foreign key cocok dengan tabel outbox yang sudah ada. Seluruh 36 migration diuji pada MariaDB 11.6.2 lokal sementara. Migration berhasil dijalankan pada MySQL VPS tanggal 10 Oktober 2026.

File diubah: `prisma/schema.prisma`, `.env.example`, `.gitignore`, `package.json`, `package-lock.json`, `deployment/maintenance.cjs`, `deployment/verify-dispatch.cjs`. Dependency baru `read-excel-file` terkunci dalam lockfile. Snapshot audit baru `deployment/npm-audit-upgrade.json` melaporkan 0 kerentanan.

## Deployment ke server yang sudah ada

1. Backup database, source/build, environment dan folder media/session. Pertahankan secret/database URL/sesi produksi. Gunakan Node 24 yang sudah dipakai aplikasi.
2. Salin/commit perubahan ini ke checkout server. Jalankan `npm ci`, `npx prisma migrate deploy`, `npx prisma generate`, lalu `npm run build` dengan WhatsApp dinonaktifkan untuk proses build saja.
3. Tetapkan akun owner yang harus menjadi admin melalui akses database terkontrol, misalnya `UPDATE users SET role = 'ADMIN' WHERE email = 'EMAIL_OWNER_YANG_DIVERIFIKASI';`. Jangan mempromosikan seluruh pengguna. Semua akun lama default USER. Atur limit/paket sesuai kebutuhan.
4. Pastikan `DISPATCH_QUEUE_ENABLED=true`; pertahankan nilai WHATSAPP_ENABLED yang memang dipakai produksi. Tidak perlu Redis; QUEUE_ENABLED lama dapat tetap false. Custom server `src/server/index.ts` menjalankan worker MySQL; `next start` sendiri tidak menjalankan worker.
5. Reload hanya aplikasi PM2 Doran yang sudah ada, dengan environment yang diperbarui. Jangan menyalin `.env.example` di atas `.env` produksi. Simpan konfigurasi PM2 sesuai praktik server yang sudah dipakai.
6. Buka dashboard, verifikasi admin/device/kontak/media/log dan statistik, buat campaign kecil hanya pada nomor penerima yang memang dipilih untuk uji nyata. Periksa QUEUED → SENT → DELIVERED/READ; UNCERTAIN harus diperiksa di penerima sebelum pengiriman ulang.

Rollback source/runtime: restore source/build sebelumnya dan reload aplikasi. Pertahankan migration/tabel/kolom additive serta semua outbox yang telah menerima request; jangan drop tabel riwayat/antrean ketika rollback. Worker lama tidak memahami status pause campaign baru, jadi hentikan worker sebelum rollback jika ada campaign aktif dan tinjau antreannya.

## Menjalankan pengujian lokal

Build menggunakan Node 24, dependency terkunci, DATABASE_URL database uji, WHATSAPP_ENABLED=false dan QUEUE_ENABLED=false:

```sh
npm ci
npx prisma generate
npx prisma validate
npm run build
```

`deployment/verify-marketing-upgrade.cjs` sengaja menolak database selain `127.0.0.1:33179/doran_upgrade_test*`. Siapkan database disposable itu dan jalankan semua migration. Untuk API/visual, jalankan Next di `127.0.0.1:3017` dengan DATABASE_URL yang sama, NEXTAUTH_SECRET khusus uji, NEXTAUTH_URL=http://127.0.0.1:3017, WHATSAPP_ENABLED=false dan DISPATCH_QUEUE_ENABLED=true. Script membuat pengguna/device/file sintetis, menguji API dan worker menggunakan socket tiruan, lalu membersihkan fixture. Jalankan suite secara serial pada database uji yang sama.

```sh
node deployment/verify-marketing-upgrade.cjs
node deployment/verify-dispatch.cjs
node deployment/verify-qr.cjs
node deployment/verify-pairing.cjs
node deployment/verify-test-send.cjs
```

Screenshot opsional: UPGRADE_SCREENSHOTS=true, UPGRADE_PLAYWRIGHT_PATH menunjuk modul Playwright yang tersedia, UPGRADE_BROWSER_CHANNEL=msedge (atau chrome), dan NEXTAUTH_SECRET harus sama dengan server uji. Browser headless menggunakan cookie untuk pengguna sintetis saja.

Hasil verifikasi: build Next/TypeScript berhasil, seluruh migration berhasil di database lokal, pengujian API/database/mock worker berhasil, regresi lama berhasil, audit 0. Build masih memiliki peringatan lint React Hook dari komponen lama; tidak ada error lint/TypeScript. Pengiriman/delivery nyata, sync riwayat kontak lengkap, tampilan tombol/list pada WhatsApp nyata, penerbitan SSL baru belum diverifikasi. Deployment VPS, HTTPS yang sudah ada, migration dan API dashboard sudah diverifikasi pada 10 Oktober 2026.

