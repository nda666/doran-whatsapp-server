# Audit WhatsApp / Baileys — 1 November 2026

Status lanjutan: setelah audit, pengguna menyetujui enam perbaikan terbatas. Implementasi aktual memakai transportSafety.ts, sendFence.ts, dispatch/health.ts dan dispatchControlAuth.ts, ditambah integrasi pada caller existing. Lihat `../transport-safety-20261101.md` untuk hasil terbaru. Traffic guard, ledger SQL, batas isi identik, rumus warm-up alternatif dan integration.patch di direktori ini tetap merupakan proposal audit yang tidak diaktifkan. Patch dan verifier integrasi virtual lama ditujukan ke source sebelum implementasi lanjutan; jangan menerapkannya pada source baru.

Bagian berikut merekam keadaan dan proposal pada saat audit awal yang bersifat read-only. Perubahan hardening sebelumnya yang sudah ada di working tree dipertahankan.

| Poin | Status | Aksi |
| --- | --- | --- |
| A1. 8–15/menit dan batas harian | Sebagian sudah ada | Kuota harian atomik sudah ada; tambahkan plafon rolling 60 detik jika diperlukan. |
| A2. Delay acak 1,2–3 detik | Sudah ada mekanismenya, rentang berbeda | Pertahankan delay produksi yang lebih panjang; jitter tambahan tidak mempercepat pengiriman. |
| A3. FIFO tanpa burst | Sebagian sudah ada | Queue MySQL persisten dan lease tersedia; produksi newest, jalur langsung belum antrean durable. Serializer opsional menahan promise transport sebenarnya. |
| A4. Pesan identik 3–5/jam | Belum ada sebagai batas isi | Idempotency transaksi sudah ada; ledger opsional membatasi payload identik per nomor pengirim. |
| A5. Broadcast berjeda | Sudah ada pacing utama, jalur legacy terbatas | Pertahankan guard terpusat; migrasi jalur langsung ke durable queue perlu keputusan perilaku terpisah. |
| A6. Warm-up 20 × 1,8 selama 7 hari | Warm-up ada, algoritma berbeda | Jadwal saat ini 10/20/30/40/45 per tahap dua hari; helper tujuh hari tersedia tetapi tidak diintegrasikan. |
| B1. Auth persisten | ✅ Sudah ada | DB terenkripsi dan lease menggantikan helper multifile; jangan ditulis ulang. |
| B2. Reconnect + ramp-up | Reconnect sudah ada, ramp-up belum | Tambahan cooldown 30 detik dan plafon bertahap 5/10/batas normal. |
| B3. HTTP/WebSocket terautentikasi | ✅ Sudah ada untuk bot; ada penguatan kontrol | Listener loopback dan tes tanpa auth ditolak; kontrol session/QR perlu pemeriksaan ulang status pemilik. |
| B4. Retry terbatas | ✅ Sudah ada; timeout dapat diperkuat | Pertahankan retry terbatas dan uncertain; tambahkan fence sebelum transport dan serializer. |
| B5. Baileys minimal 6.7.22 / 7.x | ✅ Sudah ada | package.json mengunci 7.0.0-rc14; tidak perlu upgrade untuk memenuhi checklist. |

## Bukti kode dan runtime

Seluruh jalur pemanggilan sendMessage aplikasi ditelusuri: dispatch worker, chat manual, auto-reply, AI, sendMessageFromIo, sendGroupMessageFromIo dan attachment; wrapper makeWASocket menjadi batas guard bersama. Dibaca pula package/lock/config PM2, auth/penyimpanan/recovery, queue/routing/retry/ACK, campaign preparation, endpoint pengiriman/kontrol, middleware HTTP/Socket.IO, pengaturan dan UI policy. Tidak ditemukan pemanggilan relayMessage/sendNode aplikasi yang melewati wrapper tersebut pada pencarian source.

- `src/server/messaging/safety.ts`: transaksi dengan lock policy perangkat, daily usage, quota reset, operating hours, warm-up, health multiplier/pause, nextAllowedAt, opt-out. Menghitung percobaan, bukan hanya pesan berhasil. Tidak menyediakan penghitung rolling satu menit atau batas isi identik per jam.
- `src/server/libs/makeWASocket.ts`: identitas pengirim, kepemilikan auth, status restriction, shared guard, protokol/getMessage dan histori. Belum mengunci keseluruhan promise transport per nomor.
- `src/server/libs/waAuthState.ts`, `waStorage.ts`, `waMessageStore.ts`: auth/Signal keys terenkripsi dalam DB, migrasi legacy, ownership lease, protocol store. Normal reconnect tidak menghapus auth. Logout/cleanup eksplisit memang dapat membersihkannya.
- `src/server/events/connectionUpdate.ts`, `src/server/waRecovery.ts`: reconnect 2/4/8/16/32/60 detik; restart-required 515 ditangani khusus. LoggedOut, forbidden, connectionReplaced, badSession dan multideviceMismatch tidak diulang tanpa batas. Ini perlu dipertahankan; reconnect semua kondisi kecuali logout bukan perbaikan yang tepat.
- `src/server/dispatch/{queue,worker,retry,acknowledgement}.ts`: MySQL durable queue, idempotency/payload conflict, lease sender dan job, ACK, late receipt, retry terukur, uncertain. Concurrency 32 melayani nomor berbeda; bukan bukti 32 kiriman bersamaan pada satu nomor. Pesan gagal karena 463 pada sender group kembali dipertimbangkan sesudah 60.000 ms, sesuai instruksi sebelumnya.
- `src/server/campaigns/prepare.ts`: scheduling dan pemetaan audience; worker/shared guard tetap menentukan pacing sebenarnya. Jalur legacy melakukan loop await, tetapi tidak menunggu guard sampai jadwal berikutnya secara durable; suatu batch dapat berhenti/gagal sebagian saat throttled. Chat dan auto-reply juga belum melewati antrean MySQL tersebut.
- `src/components/phone/PhoneFormModal.tsx`: warmupEnabled default false. `src/pages/api/phones/index.ts` hanya mengubah warm-up jika field dikirim. Karena itu nomor baru tidak otomatis masuk warm-up.
- `src/server/libs/socket.ts`, `apiAuthMiddleware.ts`, dispatchAuth/queueAccess dan API terkait: autentikasi, origin/approval/session checks. Pada `src/pages/api/public/[action].ts`, cabang session/QR/disconnect/check-number memakai token perangkat valid tetapi belum mengulangi pemeriksaan active/approved pemilik sebagaimana resolver pengiriman. Ini penguatan otorisasi, bukan endpoint tanpa autentikasi.

Snapshot produksi saat audit: delay global 60–75 detik; kuota global 50; queue order `newest`; warm-up `[10,20,30,40,45]`; operating hours 06:00–23:00. Terdapat override interval perangkat, antara lain 20–25, 20–30 dan 25–30 detik; global tidak menggambarkan semua nomor. Tidak ada angka pesan/hari yang menjamin bebas restriction.

HTTP tanpa auth: `/api/device-policies`, `/api/recipient-consents`, `/health/dispatch` menghasilkan 401; `/queues` 404 karena Bull nonaktif. Handshake Socket.IO websocket tanpa auth dengan Origin yang sesuai ditolak `Unauthorized`. Listener bot Node berada di 127.0.0.1:3000; reverse proxy publik adalah jalur yang diharapkan. MySQL `*:3306` dan layanan Telegram `*:8000` juga terlihat; akses internet nyata, firewall dan autentikasi layanan tersebut belum diuji dalam audit bot ini. Tidak ada perubahan pada layanan tersebut.

## Kode siap integrasi

File implementasi lengkap:

1. `src/server/messaging/trafficGuard.ts`: policy opsional, rolling rate ledger, SHA-256 payload, batas identik per sender, ramp reconnect, physical-send serializer, helper warm-up.
2. `src/server/messaging/sendFence.ts`: async context deadline dan pemeriksaan lease tepat sebelum memulai native transport.
3. `src/server/dispatchControlAuth.ts`: adapter resolver existing untuk endpoint kontrol perangkat.
4. `traffic-guard.sql` dan `traffic-models.prisma.txt`: dua tabel/model tambahan, belum masuk schema/migration aktif.
5. `integration.patch`: titik pemasangan tepat pada lima file existing, berdasarkan working tree saat audit. Tidak menduplikasi implementasi existing.

### Rate, identik dan pengiriman serial — A1/A2/A3/A4

Patch menambah argumen context opsional pada `reserveSend`, kemudian memanggil `reserveTraffic` **di dalam transaksi existing yang sama**, setelah pemeriksaan kuota/nextAllowedAt. SQL ledger ikut rollback jika transaksi gagal. `nextAllowedAt` memakai nilai terbesar interval existing dan minimum interval traffic; tidak memperpendek delay yang sudah disimpan.

```ts
const trafficInterval = trafficPolicy
  ? await reserveTraffic(tx, phoneId, traffic!, trafficPolicy, now) : 0;
// existing usage/quota updates tetap dipertahankan
nextAllowedAt: new Date(Date.now() + Math.max(interval, trafficInterval))
```

Pada wrapper `makeWASocket`, logical message ID dibuat sekali dan diteruskan ke Baileys; ID retry yang sudah ada dipertahankan. Hash tidak menyimpan isi pesan. Definisi identik adalah payload terkanonisasi yang sama, bukan kemiripan makna; perubahan caption/context/format menghasilkan hash berbeda. Hitungan identik berlaku per nomor pengirim lintas penerima, bukan pool seluruh sender group. Retry dengan logical ID sama memakai rate budget tetapi tidak menjadi pesan identik baru. Input stream ditolak oleh helper fingerprint; sebelum mengaktifkan pada jalur stream, adapter harus memberikan hash konten stabil tanpa mengonsumsi stream. URL dihash sebagai URL, bukan mengunduh isi attachment.

```ts
return trafficPolicy ? serializePhoneSend(phoneId, perform) : perform();
```

Serializer FIFO ini melindungi promise transport per nomor dan membatasi penunggu hingga 20. Ia bukan durable queue baru, tidak mengubah pengurutan bisnis, dan tidak otomatis menjadwalkan ulang caller langsung yang ditolak guard. Default PM2 satu proses dan auth ownership lease perlu tetap dijaga; mutex ini tidak menggantikan koordinasi lintas proses/DB.

Mengubah queue order menjadi `oldest` menggunakan pengaturan yang sudah ada dapat memberikan FIFO pemilihan job due. Strict FIFO seluruh bot tetap belum tercapai karena chat/AI/legacy berada di luar queue, job memiliki jadwal/retry, dan nomor berbeda dapat berjalan paralel. Pemindahan jalur tersebut ke antrean mengubah respons/latensi bisnis sehingga tidak diselipkan dalam audit ini.

### Reconnect dan timeout — B2/B4

Patch memanggil `recordTrafficReconnect(phoneId)` saat koneksi open. Saat fitur diaktifkan, pengiriman ditahan 30 detik, rolling cap 5 pada menit pertama sejak open, 10 pada menit kedua, kemudian plafon konfigurasi. Interval existing yang lebih panjang tetap menang.

Worker dibungkus `withSendFence` dengan deadline ACK existing dan pemeriksaan job masih PROCESSING, messageId dan leaseToken masih sama. Wrapper memanggil `assertSendFence()` tepat sebelum native send. Ini mencegah preflight yang terlambat baru memulai transport setelah job kadaluarsa; tidak dapat membatalkan native send yang sudah dimulai. Serializer menahan lock sampai promise aslinya selesai. Jika native send menggantung, penunggu dibatasi; pemulihan koneksi/session tetap diperlukan.

Retry existing tetap dipertahankan: utama maksimal lima untuk jalur timeout/ACK, jeda 1/2/4/8 menit; unknown transport awal dapat menjadi UNCERTAIN, bukan blind resend. Legacy 428 juga terbatas, tetapi hingga lima/enam pemanggilan menurut implementasinya dan belum membawa persistent logical ID yang sama pada semua jalur. Fence audit dipasang pada worker; jangan menganggap semua timeout chat/legacy sudah memiliki fencing yang sama. Fallback sender group setelah 463 tetap satu menit.

### Otorisasi kontrol perangkat — B3

Patch mengganti lookup token langsung pada cabang kontrol `src/pages/api/public/[action].ts` dengan:

```ts
phone = await resolveControlDevice(req, body);
```

Adapter memakai resolver existing untuk memvalidasi pemilik aktif/disetujui dan tetap mewajibkan token perangkat. Endpoint pengiriman, format respons dan aturan pemilihan sender tetap dipertahankan.

### Warm-up tujuh hari — A6, alternatif belum dipasang

`sevenDayWarmupLimit` dalam trafficGuard tersedia untuk mengganti kebijakan **hanya bila dipilih secara eksplisit**:

```ts
export function sevenDayWarmupLimit(start: Date | null, maximum: number, now = Date.now()) {
  if (!start) return maximum;
  const day = Math.max(0, Math.floor((now - start.getTime()) / 86400000));
  return day < 7 ? Math.min(maximum, Math.round(20 * 1.8 ** day)) : maximum;
}
```

Jadwal teoritis 20/36/65/117/210/378/680; dengan batas 50 menjadi 20/36/50/50/50/50/50. Ini lebih cepat daripada kebijakan existing dan tidak menjamin aman. Jangan menaikkan kuota 50 secara otomatis. Titik kebijakan saat ini adalah `warmupLimit` pada safety.ts, juga dipakai routing/UI/Telegram; perubahan harus konsisten pada semua pemanggil. Patch integrasi tidak memasang helper ini dan tidak mengubah default warm-up formulir.

## Urutan aktivasi terpisah dari audit

1. Review patch dan dampak batas empat payload identik/jam pada template/notifikasi sah. Audit ini sendiri tidak mengaktifkannya.
2. Uji pada staging: tambahkan model ke schema, buat migration additive dari SQL yang disediakan. Pertahankan kolasi binary logicalId. Sesuaikan allowlist/checksum CD existing dan verifier schema; jangan mengeksekusi migrate deploy/DDL secara buta pada produksi.
3. Terapkan patch pada source yang cocok, generate Prisma client, lakukan typecheck/build dan uji MySQL nyata termasuk lock, rollback, waktu UTC dan pemulihan reconnect. Patch memakai raw SQL sehingga tsc saja tidak memverifikasi schema/konkurensi DB.
4. Sebelum flag aktif, pastikan semua tabel sudah tersedia. Kode guard nonaktif jika env tidak persis `true`:

```dotenv
WA_TRAFFIC_GUARD_ENABLED=false
WA_MAX_PER_MINUTE=15
WA_IDENTICAL_PER_HOUR=4
```

   Untuk penerapan yang sudah diuji, ubah enabled menjadi true dan restart terkontrol. Jitter acak 1,2–3 detik ditambahkan pada minimum interval 60.000/cap; pada cap15 minimum menjadi 5,2–7 detik. Rate adalah plafon, bukan target. Delay produksi 60–75 detik tetap lebih panjang.
5. Panggil `pruneTrafficLedger()` melalui maintenance terautentikasi yang sudah ada, misalnya tiap jam; jangan tambah endpoint publik. Helper menghapus metadata lebih tua dua jam dalam maksimal 100 batch × 10.000 per panggilan. Bila volume besar, pantau apakah batch menyisakan backlog.
6. Pastikan guard failure mengembalikan retryAt ke caller/queue. Jalur langsung belum memberi delivery guarantee durable. Rollback flag menghentikan guard/ramp/serializer, tabel metadata boleh dipertahankan; patch otorisasi dan fence adalah penguatan terpisah. Tidak ada rollback produksi dijalankan dalam audit.

## Verifikasi

```powershell
node deployment/verify-traffic-audit.cjs
node deployment/audit-whatsapp-20261101/verify-integration.cjs
git apply --check --ignore-space-change deployment/audit-whatsapp-20261101/integration.patch
npx eslint src/server/messaging/trafficGuard.ts src/server/messaging/sendFence.ts src/server/dispatchControlAuth.ts
```

Verifier traffic menggunakan unit tests dan fixture transaksi, mencakup rolling window, ramp, retry identity, hash, batas warm-up, konkurensi admission, rollback quota, serialisasi real promise, bounded waiters, fencing async context dan pemeriksaan owner kontrol. Ini bukan pengujian adapter MySQL produksi. Verifier integrasi melakukan typecheck patch secara virtual tanpa menulis source existing. Tidak ada uji yang mengirim pesan WhatsApp.

Hasil lokal audit: lima kelompok verifier traffic PASS; typecheck patch virtual PASS pada lima file; pemeriksaan patch dapat diterapkan PASS; ESLint tiga modul tambahan PASS; `git diff --check` PASS. Typecheck source aktual juga telah lulus. Tidak dilakukan deployment atau eksekusi SQL tambahan.

## Batas kesimpulan

Angka 8–15/menit, jitter 1,2–3 detik dan rumus warm-up adalah kebijakan internal; bukan ambang aman resmi WhatsApp. Delay acak tidak membuat automasi menjadi perilaku manusia atau menjamin lolos restriction. Penggunaan yang diizinkan penerima dan penanganan STOP tetap penting. Audit kode ini tidak menentukan penyebab restriction sebuah nomor tanpa data penegakan WhatsApp.

Sumber primer: [Baileys README](https://github.com/WhiskeySockets/Baileys/blob/master/README.md), [WhatsApp responsible messaging](https://faq.whatsapp.com/361005896189245/?eea=0&locale=en_US), [WhatsApp Messaging Guidelines](https://www.whatsapp.com/legal/messaging-guidelines). Baileys menyarankan implementasi SQL/NoSQL untuk auth produksi, sehingga penggunaan DB di project ini dipertahankan.
