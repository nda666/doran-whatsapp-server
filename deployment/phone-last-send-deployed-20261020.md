# Terakhir Proses Kirim — 20 Oktober 2026

Live: https://dashboard.jeblast.com/dashboard/phone

Kolom Terakhir Proses Kirim terletak setelah Kuota hari ini, dapat diurutkan, dan menampilkan waktu WIB. Phone.lastSendProcessedAt diperbarui dalam transaksi reserveSend yang sama dengan increment DeviceDailyUsage.attempts. Semua sumber pengiriman yang melewati batas transport bersama, termasuk retry, menggunakan peristiwa ini. Hasil berhasil/gagal setelah transport tidak mengubah makna timestamp ini.

Permintaan yang tertahan oleh opt-out, jeda, kuota harian, atau pause tidak mengubah timestamp. Kegagalan transaksi membatalkan kuota dan timestamp bersama. Pergantian hari tidak menghapus catatan; data lama tetap NULL sampai ada percobaan baru yang menggunakan kuota. Nilai NULL ditampilkan sebagai Belum tercatat. API device-policies menyertakan timestamp bersama kuota dan dimuat ulang setiap 30 detik oleh halaman.

Migrasi aditif: 20261020020000_phone_last_send_processed.
Build aktif: NXG4DpybbyJKeIu39nIML.
Backup sumber, runtime, database, dan Prisma client: /home/jeblast/backups/doran-phone-last-send-1792457693.

Validasi lulus:

- TypeScript frontend/server dan build produksi terisolasi.
- Unit transaksi kuota/timestamp: retry, concurrent admission, penolakan, rollback, batas tengah malam WIB, serta retensi history.
- Regresi pengaturan pengiriman dan rentang jeda, termasuk render timestamp WIB dan fallback NULL.
- API staging dan produksi terautentikasi: field database, urutan asc/desc, respons device-policies, penolakan akses anonim.
- Browser produksi: kolom setelah kuota dan URL sort=lastSendProcessedAt&order=asc.

Verifier lama verify-phone-policy-sort.cjs dicoba tetapi gagal karena mock dependency ../../lib/warmupSettings belum tersedia pada harness tersebut; verifier ini tidak digunakan sebagai gate deployment. Implementasi computed policy sorting tidak diubah.

Migrasi lama yang belum diterapkan dikecualikan dari staging. Kolom Terakhir Offline sebelumnya tetap dipertahankan. Proses aplikasi online, WhatsApp/antrean enabled, dan PID proses lain dipertahankan.

Log: deployment/phone-last-send-deploy-20261020.log.
Screenshot: deployment/phone-last-send-live-20261020.png.
