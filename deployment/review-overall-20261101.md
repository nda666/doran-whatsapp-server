# Pemeriksaan menyeluruh WA Server — 1 November 2026

Lingkup: source checkout lokal, konfigurasi repository, schema/index, CI, alur WhatsApp/dispatch/chat/auto-reply, autentikasi, media dan dependensi. Ini pemeriksaan dan rekomendasi; tidak mengubah perilaku aplikasi, konfigurasi bisnis, sesi, database atau deployment. Status produksi terkini, firewall, resource server dan penyebab restriction historis tidak diuji. Catatan deployment sebelumnya dibaca sebagai riwayat, bukan bukti kondisi live saat pemeriksaan ini.

## Hasil utama

Fondasi pengiriman sudah baik: durable dispatch di MySQL, lease, ID pesan stabil pada retry worker, ACK/late receipts, status UNCERTAIN, serialisasi promise transport per nomor, deadline fence, quota admission atomik, operating hours, adaptive pause, restriction checks, auth terenkripsi dan ownership lease. HTTP API memeriksa user aktif/approved; Socket.IO memakai autentikasi dan pemeriksaan origin. Media dashboard memakai scope akses dan pembatas ukuran. Pertahankan mekanisme tersebut.

Baileys adalah integrasi WhatsApp Web, bukan WhatsApp Business Platform resmi. Optimasi delay, warm-up, serializer dan kuota tidak memberi jaminan bebas restriction. Untuk pesan bisnis otomatis jangka panjang, rencanakan adapter Business Platform/Cloud API resmi; kepatuhan penerima, isi dan kualitas tetap diperlukan.

## Temuan prioritas

### 1. P1 — Webhook auto-reply lama belum terlindungi dari SSRF dan respons tanpa batas

Bukti: `src/pages/api/auto_reply/index.ts:204,237` menyimpan URL dari request; `src/server/utils/runFetchGetResponse.ts:25` melakukan fetch langsung. Helper tidak memvalidasi alamat publik/protokol/port, tidak mem-pin hasil DNS, tidak mengatur redirect atau deadline dan membaca JSON respons tanpa plafon ukuran. Pemanggilnya adalah kedua handler auto-reply.

Dampak: pengguna berizin mengatur rule dapat membuat server mengakses layanan internal. Webhook lambat atau besar dapat menahan pemrosesan pesan dan menghabiskan resource. Ini bukan endpoint anonim tanpa autentikasi.

Perbaikan: gunakan transport bersama dengan validasi IP publik pada setiap hop, DNS pinning, deadline, batas respons dan protokol/port yang diizinkan. `sendDeviceWebhook.ts` sudah memberikan pola POST aman, tetapi webhook lama juga mendukung GET serta membaca respons JSON; jangan mengganti helper tanpa mempertahankan kontrak tersebut. Jika integrasi internal memang dibutuhkan, gunakan allowlist admin yang eksplisit.

Verifikasi: probe actual helper dengan fetch mock menerima `http://127.0.0.1:3306/internal`, tanpa signal timeout maupun opsi redirect. Tidak ada koneksi ke alamat tersebut.

### 2. P1 — Penonaktifan akun belum menghentikan seluruh pekerjaan latar

Bukti: `src/pages/api/admin/users/[id]/active.ts` menonaktifkan user, menaikkan sessionVersion dan memutus Socket.IO dashboard. Ia tidak menutup sesi Baileys atau mem-pause job. `src/server/waRecovery.ts:29` memilih perangkat aktif tanpa filter status user. Worker, sender routing dan `reserveSend` tidak memeriksa user.isActive/approvalStatus sebelum transport. Auto-reply AI mempunyai pemeriksaan owner tambahan; auto-reply biasa belum setara.

Dampak: job yang sudah mengantre dan auto-reply biasa dapat tetap dikirim setelah akses akun dicabut, selama perangkat dan policy masih mengizinkan. Pemutusan socket browser tidak sama dengan penghentian sesi WhatsApp server.

Perbaikan: pemeriksaan owner/perangkat aktif pada batas transport bersama, pemeriksaan sebelum claim/recovery dan penahanan job dengan alasan yang jelas. Tutup sesi terkait bila semantik penonaktifan akun memang harus menghentikan seluruh aktivitas; jangan menghapus auth sehingga aktivasi kembali tidak memerlukan pairing ulang. Terapkan juga pada jalur Telegram yang berbagi guard.

### 3. P1 — Persetujuan penerima masih catatan administratif, belum syarat kirim

Bukti: pencarian `recipientConsent` di source menunjukkan CRUD/revocation pada endpoint consent dan penanganan STOP; tidak ada pemeriksaan grant aktif pada persiapan campaign, worker, chat atau reserveSend. Campaign menerima nomor/kontak tanpa kategori tujuan pesan. Suppression yang sudah tercatat tetap diperiksa.

Dampak: tersedianya menu consent tidak menjamin campaign hanya menuju penerima yang mengizinkan pesan. Izin pembaruan pesanan juga belum dibedakan dari izin promosi pada pengiriman.

Perbaikan: tambahkan purpose untuk pesan proaktif, cek consent aktif saat enqueue dan tepat sebelum transport, serta preview jumlah layak/tanpa izin/opt-out. Bedakan balasan layanan terhadap pesan masuk dari promosi proaktif. Terapkan kebijakan sesuai konteks bisnis; jangan menyamakan seluruh balasan support dengan campaign marketing.

### 4. P1 — Auto-reply biasa/webhook belum memiliki deduplikasi pesan masuk dan filter live setara AI

Bukti: `src/server/libs/makeWASocket.ts:220–279` meneruskan messages.upsert ke handler biasa tanpa membatasi `type === 'notify'`. Hanya `allowAi` yang dibatasi. `sendAutoReply.ts` tidak menyimpan identitas pesan masuk yang telah diproses; dedupe histori chat/protocol store tidak menjadi gate efek samping auto-reply. Helper sebenarnya berada di `src/server/campaigns/autoReply.ts`.

Dampak: event append/redelivery berpotensi memicu balasan atau webhook lama/berulang. Shared rate guard membatasi admission, tetapi tidak memberikan idempotensi efek samping.

Perbaikan: histori tetap boleh disimpan, sedangkan auto-reply/webhook diproses hanya untuk event live yang layak; gunakan claim persisten unik `(phoneId, inboundMessageId, ruleId, action)` sebelum efek samping, batas usia pesan dan kebijakan satu atau banyak rule yang eksplisit. Jangan blind retry setelah transport ambigu.

Verifikasi: dua pemanggilan helper auto-reply biasa dengan inbound message ID sama memanggil socket mock dua kali. Probe ini membuktikan tidak ada dedupe pada helper; bukan bukti pesan duplikat benar-benar terkirim di produksi.

### 5. P1 — Deteksi STOP bisa dimatikan

Bukti: `src/server/messaging/safety.ts:37` mengembalikan false jika `optOutEnabled === false`. Endpoint messaging-settings mengizinkan pengguna mengubahnya. Daftar suppression existing tetap berlaku, tetapi permintaan STOP baru tidak direkam dalam mode ini.

Perbaikan: jadikan penghormatan permintaan berhenti wajib untuk pesan proaktif. Perluas penanganan permintaan berhenti yang jelas dan kanal manual; regex kata kunci saja tidak mewakili semua permintaan natural. STOP tidak harus memicu balasan tambahan. Pertahankan proses persetujuan ulang eksplisit sebelum membuka suppression.

### 6. P1/P2 — Pembaruan dependensi perlu triase, bukan audit fix paksa

`npm audit --omit=dev` pada saat pemeriksaan: 47 entri package terdampak — 1 critical, 32 high, 14 moderate. Ini bukan 47 kerentanan independen; banyak entri adalah propagasi dependensi yang sama. Detail: `tmp/review-npm-audit-20261101.json`.

- Next.js terpasang 15.5.27. Advisory critical image optimization menyebut sharp >=0.35.5 sebagai workaround. Resolver Next.js lokal memang memuat sharp 0.35.5: mitigasi resmi sudah terpenuhi pada checkout ini. Disarankan patch Next.js ke versi perbaikan kompatibel dan validasi image processing/build di staging. Tidak ada dasar menyatakan RCE terbukti terbuka di produksi.
- Zod terpasang 3.25.76; advisory resource exhaustion meminta versi patch generasi 4. Migrasi perlu review kompatibilitas Zod aplikasi dan dependensi Jimp. Tambahkan batas ukuran/jumlah item sebelum parse sebagai defense tambahan.
- Advisory lain menyentuh body-parser, follow-redirects, minimatch, qs dan uuid; prioritaskan yang benar-benar dipanggil runtime. Bull Board nonaktif pada konfigurasi PM2 bukan bukti semua package transitif aktif sebagai endpoint publik.
- CI saat ini menjalankan npm ci dengan --no-audit dan tidak memiliki langkah audit tersendiri. Tambahkan pemeriksaan advisory berkala/CI dengan baseline pengecualian mitigasi yang ditinjau.

### 7. P2 — Jalur langsung belum punya ketahanan durable queue yang setara

Chat, auto-reply dan pengiriman grup legacy melewati guard dan serializer yang sama, tetapi bukan semuanya job durable di wa_dispatches. Ketika throttled/offline, tidak semuanya dijadwalkan ulang secara persisten. API pengiriman grup juga belum menyediakan durable request idempotency setara dispatch.

Perbaikan: satukan abstraksi intent pengiriman dengan request ID dan status; prioritaskan pemindahan jalur grup dan auto-reply ke durable queue. Tetapkan deadline/priority pesan layanan agar jawaban lama tidak muncul setelah konteks berakhir. Pertahankan aturan UNCERTAIN dan pemeriksaan late receipts.

### 8. P2 — Interval polling worker terikat jeda pengiriman

Bukti: `src/server/dispatch/worker.ts:344,353–355` memakai setting delay pengiriman untuk schedule poll. Jika setting panjang, pekerjaan yang sebenarnya sudah layak pada nomor lain atau override lebih cepat harus menunggu siklus polling berikutnya. Setiap siklus hanya mengisi slot concurrency yang tersedia; tidak langsung menjadwalkan putaran ketika slot selesai.

Perbaikan: pisahkan poll cadence pendek/adaptif dari pacing per perangkat. Quota, nextAllowedAt dan lease tetap menentukan kapan transport boleh jalan. Ukur queue age, claim latency dan beban query sebelum/sesudah; perubahan ini meningkatkan respons antrean tanpa menaikkan batas kirim nomor.

### 9. P2 — Retensi data/media dan traffic ledger belum lengkap

Bukti: `pruneTrafficLedger()` ada tetapi tidak ditemukan pemanggil di source. Jika traffic guard diaktifkan, baris akan terus bertambah tanpa scheduler maintenance. Histori dispatch/chat/inbox dan folder media belum mempunyai retensi otomatis menyeluruh di aplikasi. Filter usia antrean dan status FAILED tidak menghapus data fisik. Webhook events dan protocol store sudah memiliki cleanup tersendiri.

Perbaikan: maintenance terjadwal dengan delete bertahap, retention per jenis data, batas kapasitas disk, orphan-media cleanup dan backup sebelum penghapusan. Pertahankan dedupe tombstone/metadata selama horizon retry integrasi agar retensi tidak menyebabkan kiriman ulang transaksi lama. Terapkan streaming/range filesystem pada download media; endpoint percakapan sekarang membaca seluruh file sebelum melayani potongan range.

### 10. P2 — Verifier traffic tambahan gagal dan belum masuk CI utama

`node deployment/verify-traffic-audit.cjs` gagal dengan `Unexpected dependency: ./safety`, karena fixture loader belum menyediakan dependency sendFence saat ini. File ini tidak ada pada allowlist `deployment/ci-tests.cjs`. Ini kegagalan harness, bukan bukti transport produksi gagal.

Perbaikan: perbarui fixture untuk source aktual, tambahkan tes integrasi MySQL disposable untuk ledger/window/rollback, kemudian masukkan verifier ke CI. Dokumentasi audit lama menyebut traffic guard masih proposal, sedangkan source/schema saat ini sudah mengintegrasikannya sebagai fitur opsional. Status enabled harus dibaca dari global setting; default false bukan bukti konfigurasi live.

## Saran produk dan operasional

- Tambahkan batas frekuensi per penerima lintas nomor milik bisnis, kategori pesan, cooldown campaign, preview izin dan tombol jeda menyeluruh. Per-sender quota saja tidak mencegah satu pelanggan menerima banyak pesan dari beberapa pengirim.
- Untuk nomor baru, pertimbangkan warm-up konservatif sebagai default setelah definisi bisnis disepakati. UI sekarang default false; scheduler daily-warmup memiliki kriteria khusus dan bukan jaminan semua nomor baru masuk warm-up. Jangan menaikkan kuota berdasarkan rumus pertumbuhan semata.
- Tampilkan restriction resmi, unknown state, error transport, ACK timeout dan opt-out sebagai indikator berbeda. Failure-rate internal bukan pengukuran resmi tingkat report/block WhatsApp.
- Identitas bisnis/pengirim perlu konsisten bagi pelanggan. Audit ini tidak menyarankan rotasi nomor untuk melewati pembatasan; tangguhkan pesan/kampanye terkait dan investigasi izin, isi serta kelayakan kanal bila terjadi restriction.
- Login rate limiter masih Map per proses; pertimbangkan limiter persisten per akun dan IP serta MFA admin. NextAuth membuat PrismaClient tersendiri alih-alih singleton shared, sehingga ada pool DB tambahan yang dapat disederhanakan.
- Dokumentasi deployment sebelumnya menyebut layanan MySQL/Telegram mendengarkan pada semua interface. Itu belum membuktikan akses internet terbuka. Verifikasi firewall, binding, reverse proxy TLS, backup terenkripsi dan restore drill pada audit infrastruktur terpisah.

## Verifikasi pada pemeriksaan ini

- Node.js lokal: 24.21.0.
- Typecheck server `tsc --project tsconfig.server.json --noEmit`: PASS.
- Typecheck seluruh project `tsc --noEmit --incremental false`: PASS.
- `npm run lint`: PASS, 8 peringatan React Hook dependency; belum diperbaiki.
- `node deployment/ci-tests.cjs`: PASS hingga OFFLINE_REGRESSION_SUITE_PASSED. Pesan kegagalan DB fixture pada beberapa test memang memakai 127.0.0.1:1; bukan insiden database produksi. Satu tes Python dilewati sesuai kondisi platform.
- Verifier tambahan traffic: FAIL pada fixture dependency sebagaimana temuan 10.
- `node tmp/review-probes-20261101.cjs`: PASS untuk konfirmasi dua temuan, semua network/WhatsApp dimock.
- Audit npm terbaru: berhasil; exit code advisory nonzero sesuai adanya temuan.
- Tidak menjalankan build produksi, migration, deployment, restart server atau mengirim pesan/email nyata.

## Rujukan yang diperiksa

- [WhatsApp Business Messaging Policy](https://whatsappbusiness.com/policy/) — izin penerima, penghormatan opt-out dan persyaratan Business Platform.
- [WhatsApp Messaging Guidelines](https://www.whatsapp.com/legal/messaging-guidelines) — integritas dan penggunaan messaging.
- [Baileys repository](https://github.com/WhiskeySockets/Baileys) — integrasi WhatsApp Web.
- [Next.js maintainer advisory](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw) — versi patch dan mitigasi sharp.
- [Zod maintainer discussion](https://github.com/colinhacks/zod/pull/6475) — konsumsi memori saat validasi dan abort-early.

Urutan pengerjaan yang disarankan: webhook SSRF → penghentian pekerjaan akun nonaktif → live-event/dedupe auto-reply → consent/STOP → triase upgrade dependensi → perbaikan verifier/retensi/polling. Migrasi kanal resmi merupakan pekerjaan arsitektur tersendiri, dapat direncanakan paralel secara bisnis.
