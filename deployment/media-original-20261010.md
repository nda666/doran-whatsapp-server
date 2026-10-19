Deploy berhasil pada 10 Oktober 2026 ke https://dashboard.jeblast.com.

Akar masalah: data media sebelum originalName ditambahkan masih null sehingga kolom nama asli menggunakan label yang dapat diubah. PATCH kini membekukan nama asli legacy dalam transaksi sebelum mengganti label; nama asli yang sudah ada tidak ditimpa. Nama dokumen campaign menggunakan originalName. Form label menampilkan nama asli read-only dan penjelasan bahwa edit label tidak mengubah nama file.

Satu file lama dipulihkan berdasarkan nama pada database-before.sql dari backup revisi sebelumnya, cocok dengan id, owner dan filename; label pengguna tetap gambar makan. Metadata sebelum perbaikan disimpan di backup.

Validasi: ESLint, TypeScript dan build Linux produksi lolos. Pengujian staging terisolasi memeriksa media baru dan legacy, edit bersamaan, edit berulang, batas akses owner, label kosong, nama asli tidak dapat ditimpa, download dan nama dokumen campaign. Semua fixture dihapus tanpa pesan WhatsApp. Delapan halaman live dan 13 API read-only lolos; 68 perangkat tetap, PID Telegram tetap. Browser live memverifikasi label tetap dan nama asli dipulihkan.

Backup: /home/jeblast/backups/doran-media-original-20261010.
