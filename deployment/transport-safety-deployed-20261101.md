# Penguatan transport — hasil penerapan

Aktif di produksi pada **1 November 2026, 01:50:10 WIB**.

- Build: `mI4sys_BQ6RhUX8u_Mrsp`.
- Backup privat: `/home/jeblast/backups/doran-transport-safety-1793472435`.
- Backup mencakup source sebelumnya, runtime sebelumnya, dump database dan snapshot privat. Tidak ada schema migration atau aktivasi traffic ledger.
- Build produksi Windows lulus pada pengulangan terpisah setelah EMFILE pada percobaan pertama. Build Linux terisolasi, suite regresi offline lengkap, tes tambahan transport dan SELECT monitoring pada MySQL nyata lulus sebelum runtime diganti.
- 22/22 hash file source sesuai manifest setelah penerapan.
- Proses PM2 lain mempertahankan PID saat pergantian runtime.
- 48 nomor online. Sesi DB existing dipakai kembali; tidak ada permintaan scan QR ulang atau penggantian kredensial.
- Endpoint device-policies dan recipient-consents berautentikasi menghasilkan 200. Health tanpa autentikasi menghasilkan 401.
- Hash seluruh global settings dan field konfigurasi policy perangkat cocok sebelum/sesudah. nextAllowedAt dan counter operasional tidak termasuk hash konfigurasi.
- Konfigurasi tetap: delay global 60–75 detik, quota global 50, queue `newest`, warm-up `[10,20,30,40,45]`, jam 06:00–23:00 WIB. Override perangkat tidak berubah. Pengalihan sender setelah 463 tetap 60 detik.

Verifikasi setelah satu siklus polling: worker running, worker_last_poll_success terisi, 48 connected sockets. Health masih 503 dengan satu jenis peringatan `SENDER_OFFLINE_WITH_BACKLOG`; tidak ada `POLL_STALE` atau `CLAIM_STALLED` dalam snapshot tersebut. 4.934 job antrean belum kedaluwarsa tetap dipertahankan. Pada waktu verifikasi masih di luar jam operasional, sehingga tidak ada claim/ACK baru yang diharapkan.

Rincian implementasi: [transport-safety-20261101.md](transport-safety-20261101.md). Bukti runtime tersimpan lokal pada `tmp/transport-production-verification.json`.

Tidak ada pesan WhatsApp uji yang dikirim. Pemeriksaan tidak menjamin bebas restriction dan tidak membuktikan penyebab restriction historis. Deadline fence mencegah native send baru setelah konteks job tidak berlaku; transport yang sudah dimulai tetap tidak dapat dibatalkan olehnya. Hasil legacy yang ambigu tidak diulang otomatis, tetapi deduplikasi request eksternal pada API legacy belum menjadi durable idempotency baru.
