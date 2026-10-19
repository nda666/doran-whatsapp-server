# Detail dan salin webhook manual

Aktif pada https://dashboard.jeblast.com/dashboard/dispatch. Build final `4iLzt-2zlBWQq0NLGfFdi`.
Backup fitur: `/home/jeblast/backups/doran-dispatch-webhook-details-1791737677`.
Backup penyesuaian tinggi modal: `/home/jeblast/backups/doran-dispatch-webhook-detail-layout-1791737812`.

Modal Kirim webhook ke kasir memiliki tombol Detail webhook. Sebelum kirim, API POST dengan action=preview membentuk payload dari database tanpa membuat event atau mengirim HTTP. UUID event/sequence/waktu diberi keterangan bahwa nilai final baru dibuat saat mengirim. Sesudah kirim, detail pada modal berisi request yang digunakan, event_id, sequence, endpoint, header dengan Authorization disamarkan, payload lengkap, waktu, outcome, status HTTP dan body respons kasir. Respons dengan kode non-2xx juga tersedia; timeout tanpa respons berisi response=null. Detail terakhir berlaku selama modal masih dibuka; mengganti status menyiapkan pratinjau baru.

Salin lengkap menyalin JSON detail yang ditampilkan sebagai satu teks. Textarea read-only dapat diseleksi jika Clipboard API gagal. Tinggi mengikuti viewport agar judul dan tombol footer terlihat. Kunci autentikasi tidak diberikan ke browser; kemunculan kunci mentah di body respons disamarkan. Batas respons HTTP tetap 64 KiB; worker webhook yang tidak meminta callback tetap memakai transport sebelumnya.

Pemeriksaan lulus: TypeScript, tujuh status, preview tanpa event/network, payload sesuai transport, redaksi secret, detail error HTTP, response capture per chunk, regresi webhook status/perangkat, build Linux dan verifikasi endpoint serta bundle produksi. Tes sintetis melalui aksi API baru untuk DELIVERED/READ menerima HTTP 200, respons kasir messages_updated=0, payload/request/response cocok dan dispatch database tidak berubah. Baris sintetis dibersihkan; event audit `c01b262d-a4ec-4b91-a764-e97556e49070` dan `a6278335-ff9f-44f8-ac79-991e6100ed0b` dipertahankan.

Browser memverifikasi tombol dan detail. Clipboard hasil Salin lengkap identik dengan seluruh 1.599 karakter textarea. Filter transaksi awal 5553753 dipulihkan; detail pratinjau dibiarkan terbuka. Tidak mengirim webhook untuk transaksi tersebut. Screenshot: output/dispatch-webhook-details.png.

Penerapan pertama otomatis rollback karena salah nama skrip verifikasi live; skrip diperbaiki dan penerapan ulang beserta verifikasi berhasil. Pengaturan webhook dan database schema tidak diubah. Telegram mempertahankan PID, WhatsApp/durable dispatch tetap aktif.
