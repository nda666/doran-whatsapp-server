# Perbaikan webhook dan penolakan token kasir

Endpoint benar: `https://kasir.doran.id/api/webhooks/jeblast/dispatch-status` (tanpa koma di akhir).

Baseline produksi 12 Oktober 2026: webhook aktif; event status/duplikat HTTP 200; event tes HTTP 422. Pesan 5558236 ditolak `Token tidak valid` sebelum dispatch dibuat.

Perubahan source kasir:

- Terima event `dispatch.webhook.test` dengan autentikasi/header/waktu valid, tanpa menulis dispatch atau pesan.
- Setelah penolakan autentikasi eksplisit, baca token terkini dari API dashboard menggunakan credential integrasi. Cocokkan nomor dan ID perangkat; tolak hasil ambigu atau perubahan token bersamaan. Perbarui token lokal dan mirror store atomik.
- Ulangi satu kali dengan sender, job_id, transaction_id, penerima, dan isi yang sama, hanya jika token berubah. Timeout, HTTP 5xx, konflik, dan sukses tidak diulang oleh pemulihan token.
- Dukung PROCESSING pada polling/sinkronisasi dan tampilkan keterangan kegagalan. UUID yang tertinggal akibat token ditolak diberi label ID request belum tersimpan.
- Tes memakai mock HTTP dan SQLite :memory:, tanpa mengirim WhatsApp atau memakai database produksi.

Tidak ada migration atau perubahan credential autentikasi baru. Token integrasi dashboard harus valid dan berhak mengambil token perangkat. Jika lookup tidak tersedia, pesan tetap ditahan untuk pemeriksaan.

`baseline.json` berisi SHA-256 source lokal sebelum perubahan. File asli tersimpan di `backup-local-20261012-081123`. Pesan 5558236 tidak di-reset atau dikirim ulang oleh paket ini.

Validasi lokal: 52 tes / 260 assertions lulus. Semua file PHP berubah lulus syntax check PHP 8.1. Commit `b3013084d436655294e2395c43eb49624f78f6ff` dipush ke main melalui credential manager HTTPS yang sudah ada; GitHub Actions deployment run: https://github.com/Doran-Devs/kasirv2/actions/runs/38191185009. Perubahan lain pada WaMessageHistoryRepository tidak masuk commit ini.

Deployment sukses dan cache config/view/route produksi dibersihkan oleh workflow yang sudah ada. Verifikasi publik dari VPS Jeblast: event tes HTTP 200, event status sintetis HTTP 200, duplikat HTTP 200/duplicate=true, tanpa autentikasi HTTP 401. messages_updated=0 untuk semua tes. Pengaturan webhook tetap sama.

Event tes pascadeploy: `713f8ee1-b441-47f0-979f-977baa1cf133`. Event status sintetis: `e010560d-dd39-4162-a2a2-12fbe347c2f5`, dispatch sintetis `9ca54421-3757-4926-935f-4a1bad4a2759`.

Browser produksi memastikan pesan 5558236 tetap Failed/REVIEW, keterangan Token tidak valid terlihat, dan UUID diberi label `ID request; ditolak sebelum tersimpan`. Screenshot: `output/kasir-dispatch-fix-live-20261012.png` pada workspace WA server. Pemulihan token/ulang satu kali diuji dengan mock; tidak dipicu pada pesan pelanggan untuk pengujian.
