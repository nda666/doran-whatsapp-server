# Jeda acak khusus perangkat — 19 Oktober 2026

Sudah diterapkan ke produksi atas persetujuan pengguna pada 19 Oktober 2026. Build aktif: `b-GiVoJWNtGmMB6dJ0xMF`.

- Atur batas menampilkan Mulai (detik) dan Hingga (detik) ketika Ikuti pengaturan global dimatikan.
- Rentang bilangan bulat 1–30 detik, Hingga >= Mulai. Kedua nilai kembali null ketika mengikuti global.
- Rentang khusus menggantikan rentang global di batas transport bersama. Perlambatan adaptif tetap berlaku.
- Kebijakan minimum lama tetap memakai perilaku semula sampai diedit. Form mengisi rentang efektif lama sebagai nilai awal.
- Migrasi tambahan `20261019090000_device_delay_range` menambahkan satu kolom nullable tanpa mengubah data lama.

Verifikasi lulus:

- `deployment/verify-device-delay-range.cjs`: field form, payload global/khusus, validasi, API, batas acak khusus lebih kecil/besar dari global, kebijakan lama, perlambatan adaptif.
- `deployment/verify-messaging-improvements.cjs`: regresi kebijakan pengiriman dan admission.
- TypeScript aplikasi dan server.
- Build Next.js dan server lengkap, 117 halaman statis, di `tmp/device-delay-validation-20261019`, Node 24.19.0 dan satu worker. Build lokal di sandbox mengalami EMFILE; build lokal terisolasi di luar sandbox berhasil. Warning hooks dan ukuran data halaman yang sudah ada tetap muncul.

Paket `device-delay-range-20261019.zip` cocok dengan source lokal. Diff terhadap snapshot server ada di `device-delay-range-live-diff-20261019.txt`.

Deploy melalui `run-device-delay-range-deploy-20261019.py` selesai dengan exit code 0 setelah pengguna menyetujui deploy. Build dan Prisma client terisolasi lulus; backup database selesai; migrasi `20261019090000_device_delay_range` berhasil; API staging dan produksi lulus; layanan aktif kembali. Proses lain tetap menggunakan PID sebelumnya.

Verifikasi domain publik HTTPS juga lulus: build aktif cocok, aset halaman phone menyertakan Mulai/Hingga dan maxIntervalSeconds, API terautentikasi memuat kolom rentang, rentang terbalik ditolak dengan 400, dan akses anonim ditolak dengan 401. Tidak ada pengiriman WhatsApp atau perubahan pengaturan perangkat dalam pengujian.

Backup: `/home/jeblast/backups/doran-device-delay-range-1792376637`.
Log: `device-delay-range-deploy-20261019.log` dan `device-delay-range-public-verify-20261019.log`.
