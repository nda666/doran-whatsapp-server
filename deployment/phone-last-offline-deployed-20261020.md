# Terakhir Offline — 20 Oktober 2026

Live: https://dashboard.jeblast.com/dashboard/phone

Kolom Terakhir Offline ditambahkan setelah Status koneksi. Waktu ditampilkan dalam WIB dan dapat diurutkan. Timestamp disimpan pada Phone.lastOfflineAt ketika koneksi berubah dari online menjadi offline. Percobaan reconnect yang gagal tidak menggeser waktu awal offline; koneksi yang pulih tetap mempertahankan catatan terakhir. Penutupan sesi server, disconnect API, serta cleanup perangkat juga mencatat transisi yang diketahui.

Nomor yang belum memiliki riwayat sejak fitur diterapkan menampilkan Belum tercatat. Data historis tidak diperkirakan dari updatedAt atau waktu migrasi.

Migrasi aditif: 20261020010000_phone_last_offline. Migrasi lama yang belum diterapkan, 20261019100000_align_legacy_inbox_and_phone_constraint, dikecualikan dari staging.

Build aktif: ZkgOZa8bjwWKe51aoOkCW.
Backup sumber, runtime, Prisma client, dan database: /home/jeblast/backups/doran-phone-last-offline-1792457414.

Validasi lulus:

- Pemeriksaan TypeScript frontend/server serta build produksi terisolasi.
- Skenario offline pertama, reconnect berulang, pulih online, offline berikutnya, presence, stale socket, maintenance, serta kegagalan database.
- Regresi scan QR, status koneksi, pemulihan koneksi, cleanup, dan device webhook.
- API terautentikasi pada staging dan produksi: timestamp persisten, sorting asc/desc, serta penolakan akses anonim.
- Browser HTTPS produksi menampilkan kolom Terakhir Offline dan fallback Belum tercatat.
- Aplikasi produksi online; WhatsApp dan antrean tetap enabled; PID proses lain dipertahankan.

Log: deployment/phone-last-offline-deploy-20261020.log.
Screenshot: deployment/phone-last-offline-live-20261020.png.
