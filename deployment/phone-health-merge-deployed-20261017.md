# Penggabungan kesehatan ke Perangkat WhatsApp — 17 Oktober 2026 (WIB)

Berhasil aktif di https://dashboard.jeblast.com/dashboard/phone.

- Empat kolom setelah Status Perangkat: Kesehatan, Kuota hari ini, Jeda pengiriman, dan Status pemanasan.
- Data kebijakan dipetakan berdasarkan ID perangkat dan diperbarui setiap 30 detik melalui endpoint yang sudah ada. Pembatasan akses pemilik tetap dilakukan oleh API.
- Status pengiriman (siap/dijeda/dihentikan) berada pada kolom Kesehatan.
- Aksi → Atur batas membuka pengaturan kuota, jeda khusus/global, adaptif, jeda pengiriman, dan pemanasan. Semua perubahan disimpan bersama lewat Simpan. Menyimpan pemanasan yang sudah aktif tidak memulai ulang tanggalnya.
- Keterangan kesehatan/kuota/pemanasan dipindah ke panel informasi yang dapat dibuka di atas tabel.
- Menu sidebar Kesehatan perangkat dihapus; URL lamanya mengalihkan ke Perangkat WhatsApp melalui redirect server.
- Tidak ada migrasi atau perubahan API/backend.

## Verifikasi

- TypeScript lokal lulus. Lint hanya memperlihatkan peringatan dependensi hook yang sudah ada pada halaman phone.
- Tes sintetis lulus: pencocokan ID perangkat, status kesehatan, kuota global/custom, jeda khusus/global, status pemanasan, payload penyimpanan, mulai/akhir pemanasan, pencegahan submit ganda, penanganan gagal simpan, menu aksi, dan tujuan redirect.
- Tes koneksi perangkat yang sudah ada lulus.
- Build Next.js dan TypeScript server di staging lulus. Percobaan pertama menemukan redirect statis yang tidak didukung pada prerender; diperbaiki menjadi getServerSideProps sebelum deploy berhasil.
- Produksi: PM2 online, HTTP startup lulus, WhatsApp dan antrean aktif, PID Telegram tetap sama, hash source sesuai manifest.
- Browser berautentikasi: empat kolom tampil, Atur batas tersedia di menu Aksi, modal menampilkan perangkat yang benar, kuota custom dan jeda khusus muncul saat switch dimatikan, pemanasan dapat dipilih, kemudian modal ditutup tanpa menyimpan. Redirect URL lama diverifikasi langsung.
- Tes penyimpanan memakai mock API; pemeriksaan browser tidak mengubah kebijakan perangkat atau mengirim pesan.

Build aktif: `fEeo1Mf64afKTnkmCXLFg`.

Backup sebelum deploy: `/home/jeblast/backups/doran-phone-health-merge-1792205893`.

Log: `deployment/phone-health-merge-deploy-20261017.log`.

Screenshot: `output/phone-health-merge-after.jpg`.

Staging dibersihkan dan retensi backup dijalankan sesuai prosedur deployment.
