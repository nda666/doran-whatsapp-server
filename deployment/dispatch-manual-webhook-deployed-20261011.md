# Aksi Kirim webhook manual

Diterapkan 11 Oktober 2026 ke https://dashboard.jeblast.com/dashboard/dispatch.
Build: `hr3SEP_kssM4saKqa3jzl`.
Backup: `/home/jeblast/backups/doran-dispatch-manual-webhook-1791734530`.

Admin utama memilih Kirim webhook pada satu baris, mengganti status, kemudian mengirim. Endpoint tetap https://kasir.doran.id/api/webhooks/jeblast/dispatch-status. Identitas dispatch/job/perangkat/pemilik/store/transaksi/penerima berasal dari database server; request browser hanya menerima id dan status. Waktu, error, event UUID dan sequence disiapkan otomatis. Kunci menggunakan konfigurasi status untuk endpoint tersebut, atau kunci integrasi webhook wa-phone kasir yang sudah tersimpan. Kunci tidak dikembalikan ke browser. Webhook otomatis tidak diaktifkan oleh aksi ini.

Tidak mengubah WaDispatch atau mengirim ulang WhatsApp. Status yang dipilih dikirim ke kasir, sehingga dapat memperbarui pesan kasir yang cocok. Riwayat webhook memakai sequence outbox dan mencatat hasil HTTP. MANUAL_SENDING terpisah dari antrean worker, sehingga tidak ada retry otomatis; HTTP gagal/timeout ditampilkan sebagai hasil belum terkonfirmasi. Status DELIVERED pada riwayat berarti endpoint memberi 2xx, bukan bukti pesan WhatsApp diterima.

TypeScript, mock tujuh status, akses admin, validasi input, secret scoping, metadata/waktu, tanpa mutasi dispatch, failure/no-retry, regresi webhook otomatis dan full build Linux lulus. Promosi dilindungi baseline source, backup runtime dan rollback otomatis. Telegram tetap pada PID sebelumnya; WhatsApp/durable dispatch tetap aktif.

Verifikasi live: API unauthenticated 401, metode GET 405, status invalid 400, id tidak ditemukan 404, halaman/bundle baru. Tes end-to-end melalui API baru memakai satu dispatch sintetis terminal FAILED, job_id=null, recipient dummy dan transaction_id unik. DELIVERED dan READ sama-sama HTTP 200 dengan riwayat DELIVERED dan satu percobaan; dispatch database identik sebelum/sesudah. Baris sintetis dihapus sesudah tes, metadata event dipertahankan untuk audit. Event IDs: `15360ac1-b9d0-42bb-986c-432adf80d9c7`, `6d6daae1-f1f7-4843-8813-e06d4f16f379`.

Browser memverifikasi tombol, data otomatis dan tujuh opsi status. Form pada pengiriman yang sebelumnya dicari dibiarkan terbuka; tidak mengirim webhook untuk pengiriman pelanggan tersebut.
