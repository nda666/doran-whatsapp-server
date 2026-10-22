# Pengalihan nomor pengiriman manual

Pada Perangkat WhatsApp, kolom **Menunggu pengiriman hari ini** menghitung status
QUEUED yang dibuat pukul 00.00 sampai sebelum 00.00 hari berikutnya dalam WIB.
Hitungan mengikuti perangkat pengirim yang ditugaskan, termasuk setelah pengalihan.

Menu aksi **Ubah nomor pengiriman** membuka jumlah antrean yang memenuhi syarat
dan pilihan nomor aktif, terhubung, sehat, tidak maintenance/dijeda dan memiliki
sisa kuota setelah batas pemanasan. Semua pilihan harus milik akun yang sama
dengan perangkat asal, termasuk untuk super admin. Tidak perlu Grup Pengirim.
Nomor fisik yang sama tidak bisa dipilih sebagai pengganti.

GET/POST `/api/phones/:id/reassign-sender` memakai autentikasi dashboard.
POST menerima `{ "targetPhoneId": "UUID" }`; ketersediaan diperiksa lagi saat simpan.
Respons `{ "count": N }` menyatakan jumlah aktual yang berhasil dialihkan.
Jika tidak ada pesan yang masih memenuhi syarat, hasilnya nol.

Pengalihan mencakup semua tanggal yang masih memenuhi batas usia normal, khusus
pesan QUEUED dengan keterangan menunggu perangkat terhubung. Pesan campaign tetap
harus aktif, sudah terjadwal dan belum kedaluwarsa. Pesan dengan message ID,
receipt, lease pemrosesan atau riwayat percobaan transport selain SKIPPED
dikecualikan. FAILED/UNCERTAIN tidak dihidupkan kembali.

Identitas dispatch, token/device asal, dedupe key, isi, penerima, transaksi,
tanggal, attempts dan nextAttemptAt tetap. `senderPhoneId` menetapkan nomor
pengganti dan `senderGroupId=NULL` menandakan penugasan tanpa grup. Worker
mempertahankan penugasan ini, termasuk retry ACK. Claim membandingkan assignment
dan message ID yang dibaca sehingga worker lama tidak bisa mengirim dari snapshot
sebelum pengalihan. Update bersyarat tidak mengubah pesan yang telah diklaim.
Worker memeriksa giliran pada seluruh antrean siap kirim milik pengirim aktual,
termasuk pesan asal nomor itu sendiri, menggunakan urutan global yang sama.

Pengiriman tetap melalui worker/transport yang sama: batas usia, jadwal campaign,
opt-out, kuota atomik, pemanasan, kebijakan kesehatan, jam operasional, jeda serta
lease nomor pengganti tetap berlaku. Kuota tidak dipesan saat memilih nomor.
Jika kondisi nomor berubah, pesan menunggu aturan normal; tidak otomatis pindah
ke nomor lain. Antrean tetap mengikuti nextAttemptAt sebelumnya. Pemulihan kuota
dan watchdog menggunakan identitas pengirim yang ditugaskan.

Pengalihan hanya berlaku pada antrean yang ada saat simpan. Kiriman baru tetap
mengikuti nomor asal/pengaturan grup sebelumnya. Tanpa perubahan skema database.

Verifikasi tanpa pengiriman WhatsApp nyata:

- `node deployment/verify-manual-sender-reassignment.cjs`
- `node deployment/verify-dispatch-ack-retry.cjs`
- `node deployment/verify-quota-recovery.cjs`
- `node node_modules/typescript/bin/tsc --project deployment/tsconfig.phone-cleanup-check.json --pretty false`
