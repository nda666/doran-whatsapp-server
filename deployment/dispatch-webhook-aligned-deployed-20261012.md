# Tata letak modal webhook dirapikan

Aktif pada 12 Oktober 2026 (Asia/Jakarta). Build final `U8X3feYR4A1UHkWoueI9S`.
Backup alignment: `/home/jeblast/backups/doran-dispatch-webhook-aligned-1791738413`.
Backup keterangan singkat: `/home/jeblast/backups/doran-dispatch-webhook-compact-note-1791738536`.

Bagian yang ditandai pengguna kini satu kolom: label memiliki lebar konsisten 120 px, nilai mulai pada posisi horizontal yang sama, tanpa titik dua atau pasangan field di sisi kanan. Endpoint dan dua UUID tampil utuh pada layar pengguna. Kotak keterangan menjadi satu kalimat agar detail/form/footer muat di viewport. Aksi, payload, header Authorization dan fungsi Salin lengkap tidak berubah.

TypeScript, build Linux dan verifikasi halaman/API lulus. Browser menampilkan hasil final yang sejajar, dan pengukuran DOM `body.scrollHeight <= body.clientHeight` lulus pada viewport pengguna. Screenshot `output/dispatch-webhook-aligned.png`. Filter transaksi 5553753 dipulihkan dan modal dibiarkan terbuka; tidak ada webhook atau WhatsApp pelanggan yang dikirim saat pemeriksaan.
