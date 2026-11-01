# Traffic guard, status akun, dan patch dependensi — 1 November 2026

## Perubahan

- Verifier traffic diperbaiki agar menguji konfigurasi aktual dengan fixture anggaran eksplisit. Fence memakai error class yang benar; uji serialisasi kini memakai `serializeTransport` yang dipakai runtime. Verifier masuk suite offline CI.
- CI mempunyai uji MySQL khusus untuk admission traffic konkuren, rollback, identitas retry, reconnect cooldown, dan query worker terhadap job yang sudah mempunyai message ID tetapi ditahan oleh ACCOUNT_INACTIVE/RECIPIENT_FREQUENCY.
- Pemilik akun nonaktif/tidak approved tidak dapat membuka koneksi baru. Status diperiksa kembali setelah auth acquisition untuk menangani penonaktifan saat proses pairing/recovery sedang menunggu I/O.
- Endpoint penonaktifan dan penolakan approval menutup socket WA milik akun, melepas lease auth, dan menghapus timer reconnect. Kredensial tidak dihapus; reaktivasi tetap dapat memakai sesi tersimpan. Penolakan approval juga menaikkan sessionVersion agar JWT lama tidak hidup kembali setelah persetujuan ulang.
- Recovery memeriksa owner sebelum shortcut timer/blocked. Event pesan/kontak/panggilan dan pemeriksaan restriction periodik memeriksa owner; pesan masuk dicek kembali setelah proses media sebelum webhook/balasan. Rule webhook memeriksa owner tepat sebelum membuat request HTTP.
- Penonaktifan assignee tidak menutup perangkat milik owner lain. Akses assignee tetap dicabut oleh autentikasi yang sudah ada.
- Query kandidat dan monitoring dispatch kini mengenali ACCOUNT_INACTIVE dan RECIPIENT_FREQUENCY sebagaimana retry policy. Job yang sudah memiliki message ID tidak terlewat selamanya setelah penahanan berakhir. Kuota, izin, jam operasional, ACK dan pemeriksaan restriction tetap berlaku.
- Lockfile dipatch hanya untuk `follow-redirects` 1.16.1 → 1.16.2 dan `qs` 6.16.0 → 6.16.2. Tidak ada upgrade/downgrade mayor atau perubahan batas traffic/consent.

## Batas dan keputusan yang dipertahankan

Penonaktifan mencegah dimulainya efek baru setelah pemeriksaan status, tetapi tidak dapat menarik kembali HTTP request/pesan yang sudah dikirim ke layanan eksternal. Kegagalan pembacaan status menahan pemrosesan; kegagalan cleanup dicatat dan watchdog memeriksa owner lagi. Callback administratif status perangkat/pengiriman tetap mengikuti konfigurasi webhook admin; pengaman ini secara khusus menghentikan webhook pesan masuk dan rule terkait akun nonaktif.

Angka pacing adalah anggaran internal, bukan batas resmi aman WhatsApp. Perubahan ini tidak menjamin bebas restriction. Consent campaign belum diaktifkan global karena perlu pemetaan purpose/izin yang benar terlebih dahulu.

Upgrade mayor Jimp/Baileys/Prisma, override Zod transitif lintas mayor, dan `audit fix --force` tidak dilakukan. Perubahan tersebut memerlukan staging khusus media, sesi dan database. Tidak ada perubahan konfigurasi produksi, deployment, penghapusan auth atau pesan WA nyata pada pekerjaan ini.

## Validasi

- Suite regresi offline lengkap: PASS, OFFLINE_REGRESSION_SUITE_PASSED.
- Typecheck project dan build TypeScript server: PASS. Build produksi Next.js + server: PASS dengan preload pembatas pembacaan file khusus verifikasi lokal Windows (workaround EMFILE sebelumnya, tidak dipakai runtime/deployment).
- Lint: PASS dengan 8 warning React Hook yang sudah ada; build masih memberi peringatan ukuran page-data lama.
- Verifier traffic offline: PASS.
- MySQL 8.0.30 terisolasi: PASS untuk persaingan dua client, rollback, retry, cooldown, dan SELECT worker untuk penahanan akun/frekuensi.
- Uji lifecycle socket: PASS, termasuk owner nonaktif, penonaktifan saat auth/media berjalan, isolasi assignee, pelepasan lease tanpa logout, timer dan kegagalan DB.
- Uji pencabutan akun/approval dan JWT lama: PASS.
- Uji advisory `follow-redirects`: header rahasia fixture dari array lintas realm tidak diteruskan ke origin lain; hanya menggunakan dua server loopback lokal. PASS.
- Uji advisory `qs`: input comma-array dengan toString tidak callable/null prototype tidak menjatuhkan proses; input normal tetap sama. PASS.
- Audit runtime terbaru: 46 entri paket terdampak (33 high, 13 moderate, 0 critical), turun dari 48 (34 high, 14 moderate). Ini jumlah entri paket, bukan 46 kerentanan independen atau bukti exploit produksi. JSON: `tmp/hardening-audit-after.json`.

Rujukan patch:

- https://github.com/advisories/GHSA-mrwp-f3q8-3g9p
- https://github.com/advisories/GHSA-6pq8-jhm2-2vcw
