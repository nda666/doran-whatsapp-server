# Modal hapus/reset perangkat — deployed 15 Oktober 2026

Live: https://dashboard.jeblast.com/dashboard/phone

Build ID: `jd7lcol5XlG1PixlZ-ZRg`

Backup: `/home/jeblast/backups/doran-phone-cleanup-1792023713`

Build terisolasi Linux serta tes cleanup, connection status, device webhook, registered phones, dan user active lulus sebelum promosi. Proses Telegram tidak direstart oleh deploy.

Tes HTTPS live menggunakan perangkat/akun sementara tanpa scan akun WhatsApp nyata atau mengirim pesan:

- Tanpa autentikasi, pemilik berbeda, pilihan kosong, dan perangkat sibuk ditolak.
- Checkbox token independen: token lama mendapat 401, token baru mendapat 200. Reset pengaturan saja mempertahankan token.
- Reset semua dengan token tidak dicentang mempertahankan entri/ID/nama/token, mengembalikan pengaturan awal, dan membersihkan cache kontak, auto-reply, dispatch, webhook status terkait, serta folder autentikasi.
- Socket QR live ditutup saat reset; QR baru berhasil dibuat setelah reset. Penghapusan entri juga menghapus token dan folder autentikasi.
- Browser: checkbox token terpisah, default semua kecuali hapus entri, serta konfirmasi kedua dengan penjelasan token dipertahankan. Membatalkan konfirmasi tidak mengubah pengaturan.
- Seluruh ID dan token perangkat yang sudah ada tetap utuh. Semua perangkat/akun sementara dibersihkan setelah pengujian.

Bukti UI: `output/phone-cleanup-live-confirm-20261015.png`.

Batas pengujian: logout akun WhatsApp yang benar-benar sudah tertaut tidak dijalankan terhadap perangkat produksi. Tes sesi live menggunakan socket QR yang belum dipindai; alur kegagalan logout diverifikasi dengan tes terisolasi.
