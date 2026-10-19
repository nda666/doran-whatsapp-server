# Pemanasan nomor di form tambah/edit — 17 Oktober 2026 WIB

Aktif di https://dashboard.jeblast.com/en/dashboard/phone.

- Warm up number dipindahkan dari Set limit ke form Add/Edit Device, selalu tersedia terlepas dari field tambahan admin.
- Form edit memuat status kebijakan terbaru; Simpan dinonaktifkan selama pemuatan atau bila gagal, dengan opsi Coba lagi.
- Simpan nomor dan pemanasan berada dalam transaksi database yang sama. Aktif tetap mempertahankan tanggal mulai; nonaktif menghapus tanggal mulai; pengaktifan berikutnya memulai ulang. Payload lama tanpa warmupEnabled mempertahankan status sebelumnya.
- Kebijakan kuota, jeda, adaptif, dan pause tidak ditimpa oleh form nomor.
- Set limit mendapat deskripsi adaptif (minimal 20 percobaan, 10% jeda 3x, 30% stop) dan pause manual, termasuk terjemahan Inggris.
- Tabel status pemanasan dipertahankan; data kebijakan disegarkan setelah nomor disimpan.

Verifikasi: TypeScript lokal lulus; lint tanpa error (peringatan hook lama di phone.tsx). Test sintetis create/edit, tanggal tetap, stop/restart, penghilangan flag, scope akses, rollback transaksi, invalid flag, dan default off lulus. Build Next.js dan TypeScript server staging serta tes koneksi perangkat lulus. Produksi PM2 online, startup HTTP lulus, WhatsApp/queue aktif, PID Telegram tetap, hash semua source sesuai manifest.

Browser produksi berautentikasi: Warm up number tersedia pada Add Device dan Edit Device; status edit termuat dan tombol Simpan aktif. Set limit berisi penjelasan adaptif/pause dan tidak memiliki Warm up number. Semua modal ditutup dengan Cancel; tidak mengubah kebijakan produksi atau mengirim pesan uji. Pemuatan kebijakan sempat gagal sementara sebelum deployment dan pulih pada polling berikutnya.

Build: OM-0xVw-2Hs89J7WVNpG4
Backup: /home/jeblast/backups/doran-phone-warmup-1792253144
Log: deployment/phone-warmup-deploy-20261017.log
