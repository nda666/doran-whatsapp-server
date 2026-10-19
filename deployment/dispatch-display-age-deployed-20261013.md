# Filter usia data tampilan Antrean Pengiriman

Aktif di https://dashboard.jeblast.com/dashboard/dispatch pada 13 Oktober 2026 (Asia/Jakarta).

Build ID: `-pqrVXLxPChwrrILehTlB`.
Backup source/runtime: `/home/jeblast/backups/doran-dispatch-display-age-1791858535`.

- API daftar, total pagination dan ringkasan semua status memakai `createdAt > now - dispatch-max-age-days * 24 jam`.
- Setting dibaca setiap request; perubahan berlaku pada refresh berikutnya (halaman polling 5 detik).
- Caption ringkasan menunjukkan jumlah hari yang digunakan; penjelasan Pengaturan Global diperbarui.
- Filter status dan pencarian tetap digabung dengan rentang usia. Ringkasan tetap mencakup semua status dalam rentang usia, tanpa mengikuti filter pencarian.
- Tidak menghapus data lama atau mengubah status/pesan. Detail berdasarkan ID tetap dapat dibaca sesuai hak akses.
- Uji perilaku lulus: batas waktu, seluruh status, pemisahan owner, pencarian, pagination, ringkasan dan perubahan setting.
- TypeScript aplikasi lokal serta build produksi terisolasi (Next.js dan TypeScript server) lulus; uji worker usia antrean tetap lulus.
- Verifikasi live: setting 3, daftar seluruh status hanya mengembalikan data dalam rentang usia, ringkasan sesuai total, 709 record lebih lama tetap tersimpan.
- Source digest sesuai paket, PM2 online, WhatsApp/dispatch aktif dan PID telegram-sender tetap sama.

Deployment memakai baseline source, backup runtime/source dan rollback otomatis ketika verifikasi gagal.
