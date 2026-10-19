# Dropdown aksi seragam — 10 Oktober 2026

Sudah diterapkan ke https://dashboard.jeblast.com menggunakan komponen ActionDropdown bersama.

Cakupan: Perangkat HP, Balas Otomatis, File Manager, Kontak, Grup Kontak, Campaign / Blast, Admin Panel (pengguna), dan Master Paket. Setiap kolom aksi menampilkan satu tombol Aksi dengan pilihan di dropdown. Tombol toolbar tetap sesuai fungsi halaman.

Handler lama dipertahankan. Aksi campaign mengikuti status; persetujuan pengguna mengikuti status akun; paket Standard tetap tidak dapat dihapus. Tindakan hapus, tolak pendaftaran, dan kosongkan campaign tetap memakai konfirmasi.

Verifikasi:
- ESLint pada delapan file perubahan lulus.
- TypeScript tanpa emit lulus.
- Build production di staging server lulus.
- Delapan halaman terautentikasi dan 13 endpoint read-only lulus.
- Hash seluruh sumber yang dipromosikan cocok dengan manifest.
- Browser live: dropdown Perangkat HP menampilkan seluruh opsi; Daftar Balasan dan kembali ke perangkat berjalan; Admin akun APPROVED hanya menampilkan Edit; dropdown Standard menonaktifkan Hapus dan Edit membuka form; dropdown media menampilkan empat opsi dan Hapus membuka konfirmasi yang dibatalkan.
- Kontak, grup, campaign, dan balasan yang diperiksa kosong. Implementasinya diverifikasi melalui sumber, tipe, build, dan pemuatan halaman/API; tidak membuat data produksi untuk pengujian.

Backup server: /home/jeblast/backups/doran-uniform-actions-20261010. Staging dan arsip deploy sementara sudah dibersihkan. Layanan Telegram mempertahankan PID; flag WhatsApp dan dispatch tetap aktif. Tidak mengirim pesan uji atau mengubah data bisnis.

Bukti visual: uniform-actions-preview.png.
