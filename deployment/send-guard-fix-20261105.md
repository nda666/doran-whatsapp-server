# Perbaikan status pesan yang ditahan pengaman — 5 November 2026

Sudah diterapkan pada produksi. Build aktif: `oZY6vpLhPNfUYzW1GPgjD`. Proses mulai kembali 09:09:52 WIB; verifikasi 09:10:18 WIB menunjukkan PM2 online dan 50 dari 61 perangkat WhatsApp online. Jumlah online merupakan snapshot sesudah restart, bukan klaim patch memulihkan restriction.

## Perubahan

Error pengaman dari socket yang dibuat bundle Next.js sebelumnya gagal dikenali oleh worker custom server karena keduanya mempunyai constructor `SendGuardError` terpisah. Pemeriksaan `instanceof` menjatuhkannya ke jalur `UNCERTAIN / ACK_UNKNOWN_CHECK_RECIPIENT`.

Error internal kini memiliki penanda `Symbol.for` yang konsisten dalam satu proses. Worker dan pengiriman chat memakai predicate yang memeriksa penanda, daftar kode pengaman yang diizinkan, serta validitas tanggal retry. Error provider biasa yang hanya mempunyai properti code serupa tidak dianggap aman untuk diulang.

Untuk dispatch, pengaman sebelum transport mempertahankan perilaku yang sudah dirancang:

- Status kembali `QUEUED` dengan kode asli, seperti `DEVICE_DAILY_LIMIT` atau `DEVICE_THROTTLED`.
- Jadwal retry dan aturan grup pengirim dipertahankan.
- Jumlah percobaan, message ID sebelumnya dan sender assignment dikembalikan ke nilai sebelum claim; retry ACK yang sudah pernah dikirim mempertahankan identitasnya untuk late receipt.
- Riwayat attempt ditutup sebagai `SKIPPED`.
- Opt-out tetap `SUPPRESSED`.
- Jalur chat mencatat penahanan yang diketahui belum terkirim sebagai `FAILED`, mengikuti perilaku chat sebelumnya; tidak menambahkan antrean otomatis ke chat.

Hasil transport yang benar-benar ambigu tetap `UNCERTAIN`. Tidak ada rekonsiliasi atau bulk retry pesan historis pada pekerjaan ini. Kuota, jeda, consent, warm-up dan kebijakan restriction tidak diubah.

## Validasi

- Typecheck seluruh project: PASS.
- Lint: PASS, dengan peringatan React Hook lama.
- Suite regresi offline lokal: PASS; uji percakapan tambahan: PASS.
- Build produksi pada salinan source server terisolasi: PASS.
- Probe modul Next.js dan dist hasil build sebenarnya: PASS. Constructor tetap berbeda, tetapi kedua predicate mengenali error dari bundle lainnya. Error tanpa penanda/kode tidak dikenal/tanggal tidak valid ditolak.
- Suite regresi akhir pada staging Linux, termasuk uji percakapan yang ditambahkan ke CI: PASS.
- Uji worker mencakup error kuota/jeda/restriction lintas modul, retry ACK dengan identitas sebelumnya, waktu retry, riwayat SKIPPED, opt-out, error tak dikenal, late receipts dan larangan mengulang UNCERTAIN lama.
- Backup database dan runtime dibuat sebelum promosi; metadata dan hitungan tabel sama selama pertukaran runtime.
- Build probe di direktori produksi setelah pertukaran: PASS.
- Pemeriksaan login, database, worker polling dan halaman publik: PASS.
- Snapshot pertama setelah deploy belum memuat attempt SKIPPED baru; verifikasi perilaku guard menggunakan transport mock dan modul build nyata, tanpa mengirim pesan uji ke pelanggan.

Build verifier ditambahkan ke workflow CI dan jalur CD agar masalah lintas bundle ikut diuji pada build selanjutnya.

## Deployment dan rollback

Patch dibangun dari source produksi dengan pemeriksaan hash baseline. Perubahan lokal lain pada daftar/urutan nomor tidak ikut diterapkan. Hanya tiga file aplikasi dan lima file verifikasi/CD dalam paket yang dipromosikan.

Backup server: `/home/jeblast/backups/doran-send-guard-1793844386`. Berisi source sebelumnya, runtime `.next`/`dist`, database dump privat dan log pemeriksaan. Skrip deployment memiliki rollback otomatis bila promosi atau health check gagal. Tidak ada migrasi schema atau penghapusan sesi.

Paket: `deployment/send-guard-fix-20261105.zip`.

Bukti snapshot sesudah deploy: `tmp/send-guard-postdeploy-20261105.json`.
