# Filter tanggal Antrean Pengiriman

Aktif pada 14 Oktober 2026 (WIB) di https://dashboard.jeblast.com/dashboard/dispatch.

Build: `JtwdCVYdYok9preWQqVF0`.
Backup: `/home/jeblast/backups/doran-dispatch-dates-1791944621`.

- Tanggal mulai dan tanggal selesai berada di form Pencarian. Default hari ini dan dua hari sebelumnya menurut WIB.
- Filter memakai tanggal Dibuat: mulai pukul 00:00 WIB sampai sebelum pukul 00:00 WIB hari setelah tanggal selesai.
- Form dan API menolak tanggal tidak valid serta tanggal selesai sebelum tanggal mulai.
- Tabel, total pagination dan ringkasan mengikuti rentang tanggal serta batas usia data global. Ringkasan mencakup seluruh status tanpa filter pencarian lainnya.
- API tanpa parameter tanggal mempertahankan perilaku sebelumnya. Detail berdasarkan ID tetap memakai hak akses sebelumnya.
- TypeScript lokal, uji batas tanggal dan usia data, build Next.js serta TypeScript server terisolasi lulus.
- Verifikasi live lulus: field tanggal, batas WIB, jumlah API dibandingkan database, scope pengguna, filter pencarian, validasi, dan assets.
- Baseline diperiksa sebelum promosi, runtime/source dibackup, rollback otomatis tersedia; PM2 online, WhatsApp/dispatch aktif, PID telegram-sender tetap sama.
