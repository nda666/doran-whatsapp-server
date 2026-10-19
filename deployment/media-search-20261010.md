Deployed 10 Oktober 2026 ke https://dashboard.jeblast.com/dashboard/media.

Pencarian mencakup label (name) atau nama file asli (originalName). Filter tipe: Semua, Gambar, Video, Audio, Dokumen (application/* dan text/*). Kata kunci dan tipe digabungkan dengan AND; batas owner, pagination dan total memakai kondisi yang sama. Form menerapkan filter melalui Cari dan kembali ke halaman pertama.

Validasi: TypeScript tanpa emit, ESLint pada tiga file perubahan, build produksi Linux, pengujian kondisi filter dengan fixture offline, delapan halaman terautentikasi dan 13 API read-only berhasil. Browser live memverifikasi pencarian nama asli WhatsApp Image, pencarian label gambar makan, Dokumen menyaring gambar, dan pilihan Semua tetap tersedia setelah memilih tipe lain. Tidak membuat fixture atau mengirim pesan di produksi.

Backup: /home/jeblast/backups/doran-media-search-20261010. Source produksi dipastikan tidak berubah selama build staging sebelum promosi. Semua hash perubahan cocok. Telegram mempertahankan PID; perangkat tetap 68, aktif 65 dan online 16 saat verifikasi. Staging sementara dibersihkan; backup dipertahankan. Bukti tampilan: media-search-preview.png.
