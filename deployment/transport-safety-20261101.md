# Penguatan transport WhatsApp — 1 November 2026

Lingkup disetujui: serialisasi pengiriman per nomor, pemeriksaan deadline/job sebelum native send, pengamanan retry legacy, cooldown reconnect, pemeriksaan pemilik endpoint kontrol dan monitoring worker.

## Perubahan

- `messaging/transportSafety.ts`: antrean promise per nomor, maksimal 20 task termasuk yang sedang berjalan. Lock bertahan sampai promise sebenarnya selesai, walau caller timeout. Nomor berbeda tetap independen. Ini bukan perubahan urutan durable queue bisnis.
- Wrapper `makeWASocket.ts` memakai serialisasi untuk semua caller, memeriksa send fence sebelum preflight dan sebelum native send. Identitas, auth lease, restriction, STOP, kuota dan histori existing dipertahankan.
- `messaging/sendFence.ts`, worker dan chat: deadline serta status job diperiksa kembali sebelum transport dimulai. Worker juga memeriksa messageId, leaseToken dan lease expiry. Pemeriksaan tidak membatalkan transport yang sudah dimulai dan tidak menjamin exactly-once delivery.
- Ketiga caller legacy mempertahankan ID pesan sepanjang preparation retry. Error 428 hanya boleh retry jika native send belum dimulai, dengan batas retry existing. Hasil native transport yang ambigu diteruskan sebagai kegagalan tanpa blind resend. Caller luar masih perlu mempertahankan identitas request; audit ini tidak menambahkan durable idempotency ke API legacy.
- `connectionUpdate.ts`: pada open, cooldown 30 detik dipersistenkan sebelum status online; nilai nextAllowedAt yang lebih panjang tidak dipendekkan. Tidak ada kebijakan rate 5/10/15 baru. Auth/session tidak dibuat ulang.
- Endpoint kontrol session/QR/disconnect/check-number menggunakan resolver existing untuk mengecek pemilik aktif/approved, tetap membutuhkan token perangkat.
- Monitoring: batas poll stale = maksimum 60 detik atau maksimum interval polling + toleransi 30 detik. CLAIM_STALLED/backlog-age hanya dihitung ketika sender online, tidak paused, jam operasional terbuka, job due dan jeda/lease sudah selesai. Status offline dengan backlog tetap terlihat. Sampling SQL menambahkan policy/lease readiness tanpa mengubah baris antrean.

## Dipertahankan

Tidak ada perubahan delay/kuota/override, warm-up, urutan newest/oldest, batas isi identik, persetujuan penerima, pengalihan sender group atau dependensi. Fallback 463 tetap 60.000 ms. Tidak ada migration/schema baru dan tidak ada WA_TRAFFIC_GUARD_ENABLED yang diaktifkan.

## Verifikasi

- TypeScript source lulus.
- ESLint file perubahan lulus.
- Offline regression suite lulus; test shutdown memang mensimulasikan database offline, bukan gangguan produksi.
- Tes tambahan memakai helper dan tiga caller legacy asli: serialisasi lintas caller, lock setelah timeout, isolasi nomor, bounded waiters, safe preparation retry dan larangan retry native 428 ambigu.
- Tes wrapper socket asli mencakup pengiriman bertumpuk dan invalidasi fence saat preflight tertunda.
- Tes koneksi memeriksa cooldown 30 detik dan pelestarian nextAllowedAt yang lebih panjang.
- Resolver auth asli diuji untuk owner aktif, nonaktif, pending, token tidak valid dan token user.
- Helper health diuji untuk interval 75 detik, paused/offline, readiness dan override jam operasional.

Tes menggunakan transport dan DB fixture; tidak mengirim pesan WhatsApp sungguhan. Build produksi dan status penerapan dicatat setelah pemeriksaan akhir. Build Windows pertama selesai kompilasi tetapi gagal saat page-data collection dengan EMFILE; build diulang sendiri tanpa pengujian paralel.
