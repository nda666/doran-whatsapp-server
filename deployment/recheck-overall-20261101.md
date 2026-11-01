# Hasil cek ulang WA Server — 1 November 2026

Pemeriksaan source checkout lokal, schema/index, konfigurasi aplikasi, autentikasi, koneksi WA, dispatch, chat, auto-reply, webhook, media, maintenance dan pengujian offline. Tidak mengubah aplikasi, menjalankan migrasi/deploy/restart, mengirim pesan nyata atau memeriksa infrastruktur produksi. Pengaturan tersimpan di DB produksi tidak dibaca; default source bukan bukti pengaturan live.

Laporan lama `review-overall-20261101.md` dipertahankan sebagai riwayat. Beberapa temuannya sudah tidak sesuai source saat ini.

## Kesimpulan

Fondasi aplikasi sudah memiliki banyak pengaman: durable dispatch, lease sender/auth, message ID stabil, ACK/late receipts, UNCERTAIN, serialisasi transport, deadline fence, kuota atomik, jam operasional, adaptive pause, pemeriksaan restriction dan sesi WA terenkripsi. Namun cakupan kebijakan penerima dan idempotensi inbound belum menyeluruh. Prioritaskan keduanya sebelum menaikkan volume.

Baileys mengakses WhatsApp Web, bukan adapter Business Platform resmi. Delay, warm-up, typing, variasi teks dan kuota internal tidak menjamin akun bebas restriction. Untuk penggunaan bisnis jangka panjang, sarankan adapter kanal resmi; izin penerima dan kualitas pesan tetap wajib diperhatikan pada kanal tersebut.

## Perbaikan lama yang sudah ada pada source

- `runFetchGetResponse.ts` kini memakai `safeHttpRequest`: validasi alamat publik, DNS pinning, pembatas port, tanpa redirect, deadline dan batas respons.
- `reserveSend` kini memeriksa owner aktif/approved sebelum admission transport.
- `captureStop` tidak lagi bergantung pada switch opt-out; mencatat suppression, mencabut consent dan menahan antrean penerima.
- Auto-reply biasa hanya dijalankan setelah filter event `notify`; dedupe inbound berbasis Map sudah ditambahkan.
- Poll worker dipisah dari pacing pengiriman, menggunakan interval 1–2 detik.
- `pruneTrafficLedger` dipanggil saat startup tertunda dan setiap jam.
- NextAuth memakai singleton Prisma bersama.
- Default traffic guard sekarang aktif. Status live harus dikonfirmasi dari setting tersimpan.

## Temuan yang masih perlu dikerjakan

### 1. P1 — Consent belum mengikat kategori dan belum meliputi semua jalur proaktif

`src/lib/trafficSettings.ts:24` menetapkan `requireConsent: false`. Bila diaktifkan, `src/server/messaging/recipientPolicy.ts:32` menerima sembarang consent aktif tanpa filter `purpose`, padahal CRUD/UI membedakan ORDER_UPDATES, MARKETING dan SUPPORT. `recipientVerdict` hanya dipanggil worker dispatch. Shared transport `reserveSend` memeriksa suppression/owner/kuota tetapi tidak memeriksa consent. Chat dan pengiriman langsung/legacy tidak mendapat pemeriksaan kategori yang sama.

Contoh: izin nota/pembaruan pesanan dapat meloloskan campaign promosi pada worker ketika requireConsent aktif. Ini celah kebijakan pada source, bukan bukti penyalahgunaan di produksi.

Saran: tetapkan purpose pada intent pesan, validasi izin sesuai tujuan saat enqueue dan sebelum transport untuk pengiriman proaktif, serta pisahkan balasan layanan yang sah terhadap inbound dari promosi. Tampilkan preview penerima layak, tanpa izin dan opt-out. Pengaktifan consent wajib perlu rollout yang mempertimbangkan data pelanggan dan integrasi lama.

### 2. P1 — Batas frekuensi per penerima belum atomik dan cakupannya terbatas

`recipientVerdict` membaca histori `waDispatch` sebelum claim job pada `src/server/dispatch/worker.ts:164`. Pemeriksaan dan admission bukan satu transaksi dengan lock per `(userId, recipient)`. Dua sender berbeda dapat membaca sisa kuota yang sama sebelum keduanya mengubah job menjadi PROCESSING. Serializer yang ada mengunci per perangkat, bukan per penerima lintas perangkat. Histori chat/auto-reply di luar dispatch tidak dihitung oleh kebijakan ini.

Saran: ledger/reservasi atomik per penerima dan bisnis, dengan purpose serta aturan balasan layanan yang eksplisit. Terapkan pada batas pengiriman bersama. Pertahankan batas sender saat meningkatkan concurrency. Ini potensi race berdasarkan inspeksi source; belum direproduksi dengan MySQL konkuren.

### 3. P1/P2 — Dedupe inbound masih memori dan urutan filter dapat membuang event live

`src/server/messaging/incomingDedupe.ts` memakai Map, TTL satu jam dan maksimum 50.000 entri. Restart atau eviction menghilangkan dedupe; tidak ada claim persisten efek samping webhook/auto-reply.

Di `src/server/libs/makeWASocket.ts:245`, `alreadyProcessed` dipanggil sebelum filter `type !== 'notify'` pada baris 267. Jika append terlebih dahulu membawa ID yang sama, ia mengisi Map; notify berikutnya dapat dilewati sehingga auto-reply layanan hilang. Device webhook juga dipanggil sebelum filter notify sehingga append tetap dapat diteruskan ke integrasi. Teks STOP diproses sebelum Map; replay STOP dapat mengulang audit event/pembaruan suppression.

Saran: pisahkan penyimpanan histori dari kelayakan efek samping, filter event live sebelum claim auto-reply, dan gunakan unique claim persisten `(phoneId, inboundMessageId, ruleId, action)`. Tentukan dengan eksplisit apakah webhook menerima histori, beri tipe event dan idempotency key. Gunakan batas usia pesan dan satu/multi-rule yang jelas. Hindari blind retry bila outcome transport ambigu.

### 4. P2 — Akun nonaktif masih dapat mempertahankan koneksi dan webhook masuk

Pengiriman pesan keluar kini diblokir oleh ownerCanSend. Akan tetapi `src/server/waRecovery.ts:29` masih memilih semua perangkat aktif tanpa filter status owner. Penonaktifan user hanya memutus sesi dashboard; tidak menutup sesi Baileys. Handler inbound dapat tetap menyimpan pesan dan menjalankan webhook walaupun owner nonaktif, sebelum akhirnya transport WA menolak balasan.

Saran: definisikan penonaktifan akun sebagai penghentian seluruh aktivitas, bila itu maksud produk. Filter recovery dan inbound side effects berdasarkan status owner, tutup koneksi tanpa menghapus auth, dan tahan job dengan alasan yang dapat dilihat admin. Jangan menyatakan penonaktifan user sudah menghentikan seluruh pemrosesan.

### 5. P2 — Dependensi perlu triase lanjutan

`npm audit --omit=dev` terbaru berhasil setelah izin pengguna: 48 entri package terdampak, 0 critical, 34 high, 14 moderate. Bukan 48 kerentanan independen atau bukti exploit produksi. JSON lengkap: `tmp/recheck-audit-20261101.json`.

Root advisory yang dilaporkan: deepmerge-ts, follow-redirects, minimatch, qs, uuid dan Zod transitif. Zod aplikasi sudah 4.6.7, tetapi beberapa plugin Jimp masih membawa versi terdampak. Baileys/Jimp/Prisma ikut ditandai melalui rantai dependensi. Next.js tidak tercantum sebagai package terdampak pada hasil terbaru ini.

Saran: dahulukan jalur runtime yang menerima data eksternal; verifikasi prasyarat masing-masing advisory. Upgrade transitif yang kompatibel lalu uji media/sticker, webhook, import Excel dan koneksi WA di staging. Jangan menjalankan audit fix --force: beberapa solusi resolver berupa downgrade mayor Baileys/Jimp/ExcelJS atau upgrade mayor Prisma. Tambahkan audit berkala dengan pengecualian bermasa berlaku untuk mitigasi yang benar-benar diverifikasi.

### 6. P2 — Verifier traffic gagal di luar suite utama

`node -r ./deployment/ci-register.cjs deployment/verify-traffic-audit.cjs` gagal `Unexpected dependency: ./safety`, dari fixture loader. File ini belum masuk allowlist `deployment/ci-tests.cjs`. Suite utama sudah mencakup `verify-wave-hardening`, tetapi itu tidak membuat verifier traffic yang gagal menjadi lulus.

Saran: sesuaikan fixture, tambahkan pemeriksaan transaksi MySQL disposable untuk kuota penerima konkuren, revoke consent menjelang kirim dan rollback ledger. Masukkan pengujian yang relevan ke CI. Kegagalan fixture ini bukan bukti transport live rusak.

### 7. P2 — Optimasi DB/media dan retensi masih ada ruang

- Query recipient policy memakai `(userId, recipient, status, sentAt/createdAt)`; index dispatch yang tersedia belum khusus pola recipient tersebut. Evaluasi EXPLAIN dengan data representatif sebelum menambah index komposit, karena index juga menambah biaya tulis.
- Endpoint media percakapan masih membaca seluruh file sebelum melayani range. Gunakan stat dan streaming/range untuk mengurangi lonjakan RAM. Pengiriman chat juga membaca asset untuk copy lalu loader membaca lagi; hindari pembacaan buffer ganda bila aman.
- Maintenance sudah membersihkan payload dispatch 7/30 hari dan metadata 180 hari. Retensi chat/inbox/media/orphan menyeluruh belum ditemukan; jadwalkan cleanup bertahap dan pantau disk. Pertahankan dedupe tombstone selama horizon retry integrasi.
- Login mempunyai limiter DB per IP ketika AUTH_TRUST_PROXY aktif dan limiter Map per akun/IP. Verifikasi trust proxy di produksi, tambah limiter akun persisten serta MFA admin; restart proses menghapus Map. Token device masih bisa dikirim via query untuk kompatibilitas: anjurkan Authorization header dan redaksi query pada access log.
- Atasi 8 peringatan Hook dependency setelah meninjau lifecycle socket/QR; dependency tidak boleh ditambah secara mekanis jika membuat reconnect berulang.

## Saran agar risiko restriction lebih rendah

1. Prioritaskan pesan yang diminta penerima; pisahkan promosi, nota dan layanan. Catat bukti izin sesuai tujuan.
2. Hormati permintaan berhenti termasuk yang disampaikan manual atau dengan bahasa natural. Regex saat ini hanya STOP/BERHENTI/UNSUBSCRIBE; kalimat seperti “tolong jangan kirim lagi” perlu alur penanganan.
3. Ukur opt-out, balasan, status pengiriman, queue age dan restriction secara terpisah. Health score dari error transport bukan angka report/block resmi WhatsApp.
4. Sediakan tombol pause bisnis/campaign lintas pengirim. Bila restriction terdeteksi, hentikan aktivitas terkait dan investigasi izin, isi dan frekuensi; jangan memakai rotasi nomor sebagai mekanisme melewati restriction.
5. Jangan memakai angka delay/warm-up sebagai batas aman resmi. Typing, spintax dan variasi jeda adalah fitur UX/pacing, bukan bukti kepatuhan atau jaminan anti-ban.
6. Rencanakan adapter WhatsApp Business Platform resmi untuk pesan bisnis otomatis jangka panjang. Gunakan template/jendela layanan sesuai kebijakan kanal.

## Verifikasi aktual

- Node lokal 24.21.0.
- Typecheck project `npx tsc --noEmit --incremental false`: PASS.
- Typecheck server `npx tsc --project tsconfig.server.json --noEmit`: PASS.
- `npm run lint`: selesai tanpa error, 8 warning React Hook dependency.
- `node deployment/ci-tests.cjs`: PASS, OFFLINE_REGRESSION_SUITE_PASSED; satu test Python skipped sesuai platform.
- Verifier traffic tambahan: FAIL karena fixture dependency.
- npm audit terbaru: berhasil, 48 entri package terdampak. Permintaan awal terkendala jaringan dan eskalasi awal ditolak; pengujian berhasil setelah pengguna memberi izin eksplisit.
- Tidak menjalankan production build atau uji DB produksi, tidak mengirim WA/email/webhook nyata.

## Rujukan

- WhatsApp Business Messaging Policy, dibaca 1 November 2026: https://whatsappbusiness.com/policy/ — izin penerima, penghormatan opt-out, template untuk inisiasi Business Platform.
- Repository Baileys: https://github.com/WhiskeySockets/Baileys — integrasi WhatsApp Web.
- URL advisory dan dependency paths tersedia pada JSON npm audit lokal.

Urutan rekomendasi: purpose/consent dan admission penerima atomik → dedupe persisten/filter inbound → penghentian seluruh aktivitas akun nonaktif → triase dependency dan verifier → retensi/index/streaming. Migrasi adapter resmi direncanakan sebagai pekerjaan arsitektur tersendiri.
