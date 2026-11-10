# Audit restriction WhatsApp — 5 November 2026

Snapshot utama: 08:30 WIB. Pemeriksaan read-only pada database, log PM2, konfigurasi efektif, source dan modul build produksi. Tidak ada deployment, restart, perubahan kuota, penghapusan sesi, retry antrean, atau pengiriman pesan nyata. Perubahan lokal milik pengguna dibiarkan utuh.

## Kesimpulan

Perombakan Minggu 1 November sudah terpasang; enam file inti yang dibandingkan sama dengan checkout lokal setelah normalisasi CRLF/LF. Pengaman membatasi pengiriman, tetapi tidak mengukur atau memulihkan reputasi akun WhatsApp. Ada celah cakupan konfigurasi dan bug klasifikasi error pada batas Next.js/custom server. Penyebab internal setiap keputusan restriction tetap tidak diberikan WhatsApp; reason yang tersimpan hanya DEFAULT.

Temuan ini tidak membuktikan bahwa pembaruan Minggu menyebabkan restriction, bahwa seluruh logout 401 merupakan restriction, atau bahwa penerima melaporkan pesan.

## Kondisi produksi

- 61 perangkat WhatsApp; 49 online dan 12 offline pada snapshot.
- 9 record restriction dengan flag active=true; 6 mempunyai endsAt yang belum lewat pada snapshot, 3 sudah melewati endsAt tetapi belum diverifikasi ulang karena offline. Jangan menyebut semua sembilan sebagai pembatasan yang masih dikonfirmasi berlaku sekarang.
- Satu proses PM2, fork mode, online sejak 1 November 18:47 WIB, restart counter 0. Tidak ditemukan WA_AUTH_LEASE_LOST/WA_AUTH_IN_USE pada log yang diperiksa.
- Traffic guard aktif; maksimum 15/menit, identicalPerHour=4, jitter 1,2–3 detik, reconnect cooldown 30 detik, ramp 5/10, recipientPerDay=10. Angka tersebut anggaran internal, bukan batas aman resmi WhatsApp.
- Jeda global efektif 60–75 detik. Delapan perangkat memiliki rentang khusus yang dapat mengganti rentang global; sebagian 20–30 detik. Karena itu global 60 detik bukan lantai mutlak semua perangkat.
- Kuota global 40, terakhir diubah 4 November 15:15:09 WIB. Warm-up [10,15,20,25,30] per tahap dua hari, terakhir diubah 15:15:35 WIB. Snapshot tidak menyediakan sejarah nilai konfigurasi sebelum perubahan tersebut.
- Reset kuota memakai mode after-full, hours=7. Implementasi menghitung deadline berdasarkan waktu penuh dan tengah malam; ini bukan plafon rolling 24 jam. Jangan mengartikan label harian sebagai jaminan maksimum 40 dalam setiap rentang 24 jam.
- Jam operasional 06:00–23:00 WIB.

## 1. Perlindungan reputasi/izin belum lengkap

`requireConsent=false`, tidak ada record consent aktif, dan tidak ada suppression tercatat. Ini membuktikan aplikasi belum memverifikasi izin secara wajib, bukan membuktikan pelanggan tidak pernah memberikan izin di kasir atau sistem lain.

Seluruh dispatch periode 1–5 November berasal dari source API; tidak ada campaign source pada data yang diperiksa. Fokus investigasi integrasi transaksi/API, jangan langsung menyalahkan modul campaign.

`recipientVerdict()` dipanggil worker dispatch; pemeriksaan consent/frekuensi ini belum menjadi gate bersama untuk semua jalur chat/auto-reply. Pemeriksaan suppression dan kuota terdapat pada batas transport bersama. Aktivasi consent harus didahului pemetaan izin/purpose agar balasan support dan pemberitahuan yang sah tidak terhenti tanpa konteks.

Sumber: src/server/messaging/recipientPolicy.ts, src/server/dispatch/worker.ts, src/server/messaging/safety.ts.

## 2. Warm-up bukan pemulihan otomatis setelah restriction

34 dari 61 perangkat mempunyai warmupStartedAt; 27 tidak. Nomor 6282143473961 tidak mempunyai warmupStartedAt, meskipun log menunjukkan logout pada 2 November dan kembali logout 5 November. Logout 2 November sendiri tidak cukup untuk menyimpulkan ada restriction saat itu.

Delapan perangkat lain dengan flag restriction aktif mempunyai tanggal mulai warm-up terakhir sekitar 4 November 15:16 WIB, setelah kejadian restriction terakhirnya. Tanggal itu dapat merupakan restart warm-up; snapshot tidak membuktikan perangkat tersebut tidak pernah warm-up sebelumnya.

Untuk 6282143473961, usage mencatat 50 admission pada 4 November, lalu 3 pada 5 November sebelum restriction 07:18:29 WIB. Angka tiga hari ini tidak mewakili riwayat aktivitas sebelumnya. Jangan mengaitkan restriction hanya dengan hitungan setelah tengah malam.

## 3. Health score tidak mengukur reputasi WhatsApp

`healthAssessment()` hanya menggunakan attempts dan failures teknis. Ia baru menghasilkan penilaian setelah 20 admission. Replies dan sendHours merupakan metrik terpisah, tidak masuk keputusan adaptive pause.

Contoh 4 November: Nota 22 mencatat 48 admission, 0 failure, 2 balasan; Nota 17 mencatat 41 admission, 0 failure, 3 balasan. Keduanya tetap menerima restriction. Ini menunjukkan skor teknis baik tidak berarti reputasi WhatsApp baik; bukan bukti bahwa rasio balasan itulah pemicu restriction.

Sumber: src/server/messaging/safety.ts:28, src/server/messaging/sendHours.ts, src/server/messaging/engagement.ts.

## 4. Bug nyata: guard dari bundle Next.js tidak dikenali worker

Worker memakai `error instanceof SendGuardError`. Socket dapat dibuat melalui bundle Next.js, sedangkan worker memakai class dari dist custom server. Kedua class tidak identik walaupun berasal dari source yang sama.

Probe terisolasi pada file build produksi, tanpa menghubungi WhatsApp/database:

```json
{"sameConstructor":false,"webErrorRecognizedByWorker":false,"ownClassCheck":true,"code":"DEVICE_DAILY_LIMIT","workerFallback":{"status":"UNCERTAIN","lastError":"ACK_UNKNOWN_CHECK_RECIPIENT"}}
```

Log 2–4 November memuat 3.361 kejadian DISPATCH_ACK_FAILED dengan code DEVICE_DAILY_LIMIT. Dalam sampel 1.500 catatan guard terakhir, 1.276 cocok dengan job yang masih tersimpan dan berstatus UNCERTAIN/ACK_UNKNOWN_CHECK_RECIPIENT; 224 tidak lagi ditemukan. Sampel ini menghitung catatan log, bukan klaim seluruhnya penerima unik atau pesan yang terkirim.

Pada 4 November, terdapat 431 log DEVICE_DAILY_LIMIT yang masuk jalur kegagalan ACK; database juga mencatat 431 dispatch hari itu sebagai UNCERTAIN/ACK_UNKNOWN_CHECK_RECIPIENT. Penahanan sebelum transport dapat salah dilaporkan sebagai hasil pengiriman ambigu.

Dampak: diagnosis ACK/nomor penerima keliru dan job tidak otomatis kembali antre. Ini bukan bukti kuota dibobol: guard tetap melempar error dan menahan pengiriman. Jangan mengirim ulang seluruh UNCERTAIN karena ada pula pesan ambigu yang benar-benar pernah masuk transport.

Perbaikan: identitas class/brand konsisten lintas bundle, predicate tervalidasi yang membatasi kode guard, serta uji integrasi Next.js socket → worker dist. Jangan menangkap semua objek berkode error sebagai guard. Pertahankan aturan konservatif untuk hasil transport yang benar-benar ambigu.

Sumber: src/server/messaging/sendGuardError.ts; src/server/dispatch/worker.ts:284; src/server/dispatch/retry.ts.

## 5. Pengiriman menumpuk pada awal jam operasional

| Tanggal WIB | Dispatch sentAt hari itu | Terkirim pukul 06:00–06:59 | Dibuat sebelum hari kirim |
|---|---:|---:|---:|
| 1 Nov | 757 | 191 | 209 |
| 2 Nov | 558 | 170 | 196 |
| 3 Nov | 908 | 183 | 190 |
| 4 Nov | 711 | 135 | 139 |
| 5 Nov, sampai snapshot | 234 | 225 | 200 |

Angka di dua kolom terakhir tidak harus mewakili pesan yang sama. Ini pola seluruh perangkat, bukan 225 pesan dari satu nomor dalam satu jam. Dengan jam operasi dimulai 06:00 dan backlog, pengiriman proaktif terkonsentrasi pagi. Pola tersebut layak dievaluasi terhadap kebutuhan pelanggan; belum terbukti merupakan pemicu restriction.

Ledger traffic berumur sekitar dua jam karena dipangkas berkala. Data yang masih tersedia menunjukkan puncak satu admission per nomor per menit, tanpa pasangan admission berjarak kurang dari 30 detik. Temuan ini tidak dapat diekstrapolasi menjadi bukti pacing historis sepanjang minggu.

## 6. Pembatas pesan identik tidak mendeteksi template yang dipersonalisasi

Traffic guard menghash seluruh konten final secara persis dan membatasi per phoneId. Perbedaan nama, angka transaksi, URL atau timestamp membuat hash berbeda. Pada 3 November terdapat 1.970 dispatch dengan 1.927 body yang berbeda persis; ini tidak membuktikan 1.927 jenis template atau konteks berbeda.

Batas empat pesan identik per jam tidak sama dengan batas empat notifikasi dari template yang sama. Perbaiki pengelompokan operasional berdasarkan jenis pesan dan konteks pelanggan, tanpa mengubah isi hanya untuk melewati deteksi.

## 7. Gangguan koneksi perlu dibedakan dari pembatasan

| Tanggal WIB | Log close 401 | Perangkat unik dengan 401 |
|---|---:|---:|
| 29 Okt | 2 | 2 |
| 30 Okt | 6 | 5 |
| 31 Okt | 3 | 3 |
| 1 Nov | 5 | 5 |
| 2 Nov | 9 | 7 |
| 3 Nov | 4 | 4 |
| 4 Nov | 8 | 8 |
| 5 Nov, sampai snapshot | 1 | 1 |

401 merupakan logout, tidak otomatis bukti restriction. Sebagian ID historis sudah tidak terdapat pada tabel perangkat sekarang. Record wa_restrictions hanya menyimpan status terakhir sehingga tidak cukup untuk menghitung kejadian restriction historis lengkap.

Log 4 November juga memuat 188 close 428 dan 110 close 503; 5 November sampai snapshot 199 dan 96. Pada 4 November 05:55 ada 15 perangkat berbeda mengalami 503 dalam menit yang sama. Ini menunjukkan masalah konektivitas bersama layak diperiksa, tetapi log ini belum membedakan penyebab jaringan lokal, upstream, atau layanan WhatsApp. Tidak ditemukan bukti crash PM2 atau konflik auth lease pada periode yang diperiksa.

Logger Baileys silent; log koneksi hanya memuat phoneId, state dan kode. Detail alasan remote dan peristiwa restriction sebelumnya belum diarsipkan. Tambahkan log terstruktur dengan redaksi data pribadi, jangan menyalakan dump kredensial atau pesan.

## Prioritas tindak lanjut

1. Perbaiki klasifikasi SendGuardError lintas bundle dan uji pada batas produksi yang sebenarnya. Pisahkan not-sent, restriction, logout dan ambiguous transport di laporan. Rekonsiliasi job historis dengan bukti individual; jangan bulk retry.
2. Tahan pengiriman proaktif pada akun yang sedang restricted dan lakukan pemeriksaan resmi di aplikasi/dukungan WhatsApp. Setelah boleh kembali beroperasi, gunakan pemulihan bertahap dengan evaluasi manusia, bukan otomatis kembali ke pola lama setelah QR.
3. Audit izin pelanggan pada integrasi API; petakan tujuan notifikasi, consent yang sah dan opt-out. Setelah datanya siap, terapkan pemeriksaan pada semua jalur proaktif. Nol record internal tidak cukup untuk menyatakan pelanggan tidak memberi izin.
4. Selaraskan override jeda, definisi kuota 24 jam dan warm-up dengan kebijakan operasional yang disepakati; evaluasi kelayakan backlog/umur notifikasi dan jam kirim. Tidak ada angka volume yang dapat dijanjikan aman dari restriction.
5. Simpan histori restriction dan detail disconnect yang aman; ukur hasil pengiriman dan interaksi secara terpisah dari skor teknis.
6. Evaluasi adapter WhatsApp Business Platform resmi untuk kebutuhan pemberitahuan bisnis otomatis. Sistem sekarang memakai Baileys/WhatsApp Web; delay dan warm-up tidak mengubah kanal itu menjadi integrasi resmi atau menjamin bebas restriction.

## Rujukan eksternal

- WhatsApp Help Center, penggunaan bertanggung jawab: https://faq.whatsapp.com/361005896189245/?eea=0&locale=en_US
- WhatsApp Messaging Guidelines: https://www.whatsapp.com/legal/messaging-guidelines
- WhatsApp Business Messaging Policy: https://whatsappbusiness.com/policy/

Dokumentasi tersebut menjelaskan kebijakan umum, bukan penyebab spesifik nomor-nomor di server ini.

## Bukti lokal

- tmp/audit-restrictions-20261105.json — snapshot agregat, perangkat, policy, usage dan event koneksi; tidak berisi body pesan/nomor penerima/kredensial.
- tmp/audit-restrictions-live-source-20261105.json — source inti produksi untuk perbandingan.
- tmp/audit-restrictions-extra-20261105.json — timestamp setelan, agregasi log guard dan sampel hasil.
- tmp/audit-restrictions-patterns-20261105.json — agregasi backlog dan pacing terbaru.
- tmp/audit-restrictions-20261105.cjs — script audit read-only.
