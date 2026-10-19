# Interval global dan batas minimum opsional

Deployed 17 Oktober 2026 (WIB), sesuai permintaan pengguna “yes gt, aturkan”.

- Build publik dan runtime: `l_sgwUSkfC18OQMVgEkoF`.
- Backup runtime/source/database: `/home/jeblast/backups/doran-global-interval-1792202811`.
- Paket delapan berkas: `global-interval-20261017.zip`.

`minIntervalSeconds = NULL` berarti mengikuti jeda acak global. UI Kesehatan perangkat menampilkan rentang global dan pilihan Ikuti pengaturan global. Jika pilihan dimatikan, admin dapat menentukan batas minimum tambahan; nilai efektif adalah maksimum dari sampel jeda global dan batas khusus, lalu dikalikan faktor perlambatan adaptif bila berlaku.

Jeda global diambil satu kali pada batas transport bersama, berlaku juga untuk API dan balasan otomatis. Worker menggunakan kembali waktu cooldown tersebut, tanpa menambahkan sampel jeda global kedua setelah ACK. Jeda campaign tetap menjadi batas penjadwalan tersendiri; waktu proses dan polling dapat memperpanjang jeda aktual.

Migrasi membuat kolom interval nullable. Nilai default lama 5 detik dialihkan ke NULL saat proses lama sudah dihentikan. Nilai khusus lain dipertahankan. Rollback mengembalikan NULL ke 5 sebelum runtime lama dimulai agar sesuai dengan client Prisma lama.

Verifikasi: TypeScript, ESLint terarah, uji pewarisan/batas minimum/adaptasi/cooldown tunggal, regresi campaign, build produksi, backup database, migrasi, uji konkurensi MySQL dan API staging lulus. Semua proses PM2 online dan build HTTPS publik cocok. Staging dibersihkan dan backup sebelumnya disimpan.

Hasil API produksi setelah deploy: 63 perangkat mengikuti pengaturan global, 0 memakai batas khusus. Rentang global saat verifikasi adalah 7–15 detik.
