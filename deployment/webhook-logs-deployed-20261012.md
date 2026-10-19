# Log Pengiriman Webhook

Aktif 12 Oktober 2026 (Asia/Jakarta) di https://dashboard.jeblast.com/dashboard/admin.
Build: `aUE1hNJP5NNNxtVSfv2hn`.
Backup: `/home/jeblast/backups/doran-webhook-logs-1791741085`.

Tab Log Pengiriman Webhook menggabungkan event webhook status pengiriman dan perangkat. Tombol Lihat Log Lengkap pada kedua tab pengaturan membuka menu yang sama dengan filter jenis terkait. Filter jenis/status, pencarian literal ID event/ID pengiriman/ID perangkat/nama event/keterangan, tanggal, pagination 10–100, refresh otomatis 10 detik, dan detail event tersedia. ID dapat disalin. Data diurutkan terbaru, memakai key jenis+id, dan total/pagination dihitung dari database. Endpoint GET /api/admin/webhook-logs hanya untuk admin utama; Cache-Control no-store, validasi query dan SQL berparameter.

Detail menampilkan sequence, ID event, referensi, status, jumlah percobaan, waktu dibuat/diterima, jadwal retry, keterangan terakhir dan revisi. Payload yang masih tersimpan dapat dilihat/disalin oleh admin utama. Kebijakan lama tetap berlaku: payload terminal dihapus dan event terminal dibersihkan setelah 30 hari. Log ini bukan riwayat request/response HTTP per percobaan; respons historis tidak disimpan oleh worker lama.

TypeScript sumber, ESLint file terkait, regresi worker webhook status/perangkat, validasi akses/filter/pagination/SQL/detail, build Next dan TypeScript Linux, serta pemeriksaan HTTPS/SQL langsung lulus. Browser memverifikasi 6.358 event gabungan, detail, serta shortcut/filter kedua tab. Screenshot: output/webhook-logs-admin.png. Verifikasi hanya membaca data; tidak mengirim webhook tes atau pesan WhatsApp. Deployment mempertahankan WhatsApp/dispatch aktif dan PID Telegram. Database tidak diubah.

Rollback: stop doran-whatsapp, restore source sesuai source-before.json dari backup/source (hapus hanya file baru yang baseline-nya null), restore .next/dist dari backup/runtime, startOrReload ecosystem.config.js --only doran-whatsapp --update-env. Jangan mengubah database atau sesi WhatsApp.
