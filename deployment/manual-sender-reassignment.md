# Pengalihan nomor pengiriman manual

Pada Perangkat WhatsApp, kolom **Menunggu pengiriman hari ini** menghitung status
QUEUED yang dibuat pukul 00.00 sampai sebelum 00.00 hari berikutnya dalam WIB.
Hitungan mengikuti perangkat pengirim yang ditugaskan, termasuk setelah pengalihan.

Menu aksi **Ubah nomor pengiriman** membuka jumlah antrean yang memenuhi syarat
dan pilihan nomor aktif, terhubung, sehat, tidak maintenance/dijeda dan memiliki
sisa kuota setelah batas pemanasan. Semua pilihan harus milik akun yang sama
dengan perangkat asal, termasuk untuk super admin. Tidak perlu Grup Pengirim.
Nomor fisik yang sama tidak bisa dipilih sebagai pengganti.

Modal merinci antrean yang memenuhi syarat menjadi **Hari ini**, **Hari sebelumnya**,
dan **Total**, berdasarkan waktu masuk antrean dalam WIB. Pilihan awal **Hari ini
saja** hanya mengalihkan pesan dari pukul 00.00 sampai sebelum 00.00 hari berikutnya.
Pilihan **Semua, termasuk hari sebelumnya** mencakup seluruh tanggal yang masih
memenuhi syarat. Jumlah yang akan dialihkan mengikuti pilihan; tombol Simpan
tidak aktif jika jumlahnya nol. Hitungan ini dapat lebih kecil daripada kolom tabel
karena tabel menghitung seluruh QUEUED hari ini, sedangkan modal memeriksa syarat
pengalihan tambahan. Kelayakan dan tanggal diperiksa kembali saat menyimpan.

GET/POST `/api/phones/:id/reassign-sender` memakai autentikasi dashboard.
GET mengembalikan `{ "count": N, "todayCount": N, "previousCount": N, "options": [...] }`.
POST menerima `{ "targetPhoneId": "UUID", "scope": "today" | "all" }`;
`scope` yang tidak dikirim tetap berarti `all` untuk kompatibilitas pemanggil lama.
Nilai cakupan lain ditolak. Ketersediaan diperiksa lagi saat simpan.
Respons `{ "count": N }` menyatakan jumlah aktual yang berhasil dialihkan.
Jika tidak ada pesan yang masih memenuhi syarat, hasilnya nol.

Pengalihan sesuai cakupan tanggal yang dipilih dan batas usia normal, khusus
pesan QUEUED dengan keterangan menunggu perangkat terhubung atau antrean pada
perangkat berstatus **Dihentikan: pembatasan WhatsApp** (`paused` dan `pauseReason`
terisi), termasuk ketika perangkat masih terhubung. Perangkat **Siap mengirim**
dengan kuota penuh juga dapat mengalihkan antreannya. Kuota penuh mengikuti
batas efektif (global/khusus dan pemanasan) serta siklus reset kuota perangkat.
Jeda admin tanpa alasan
pembatasan tidak menambah kelayakan pengalihan. Antrean dengan keterangan
SENDER_GROUP_UNAVAILABLE, OUTSIDE_OPERATING_HOURS atau SENDER_REJECTED_RETRY tetap
dikecualikan. Pesan campaign tetap
harus aktif, sudah terjadwal dan belum kedaluwarsa. Pesan dengan message ID,
receipt, lease pemrosesan atau riwayat percobaan transport selain SKIPPED
dikecualikan. FAILED/UNCERTAIN tidak dihidupkan kembali.

Identitas dispatch, token/device asal, dedupe key, isi, penerima, transaksi,
tanggal dan attempts tetap. `senderPhoneId` menetapkan nomor
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
ke nomor lain. Antrean tetap mengikuti nextAttemptAt sebelumnya, kecuali pesan
DEVICE_DAILY_LIMIT yang dilepas dari penundaan kuota nomor asal saat dialihkan.
Lease asal yang idle juga dibangunkan agar worker dapat memproses penugasan baru;
lease aktif tetap dilindungi.
Nomor pengganti tetap mengikuti seluruh aturan pengiriman normal. Pemulihan kuota
dan watchdog menggunakan identitas pengirim yang ditugaskan.

Pengalihan hanya berlaku pada antrean yang ada saat simpan. Kiriman baru tetap
mengikuti nomor asal/pengaturan grup sebelumnya. Tanpa perubahan skema database.

Verifikasi tanpa pengiriman WhatsApp nyata:

- `node deployment/verify-manual-sender-reassignment.cjs`
- `node deployment/verify-dispatch-ack-retry.cjs`
- `node deployment/verify-quota-recovery.cjs`
- `node node_modules/typescript/bin/tsc --project deployment/tsconfig.phone-cleanup-check.json --pretty false`
