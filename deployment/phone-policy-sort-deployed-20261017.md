# Sorting kebijakan perangkat — 17 Oktober 2026 (WIB)

Aktif di https://dashboard.jeblast.com/dashboard/phone.

- Kesehatan: skor numerik, data belum cukup selalu di akhir.
- Kuota hari ini: jumlah percobaan terpakai, bukan batas maksimum.
- Jeda pengiriman: batas minimum efektif dari minimum global/khusus dan faktor adaptif.
- Pengurutan dilakukan sebelum pagination pada seluruh perangkat yang memenuhi filter serta akses pemilik; ID memecah nilai sama agar perpindahan halaman konsisten.
- Parameter sorting tersimpan pada URL dan dipertahankan saat kembali dari balasan otomatis.
- Sorting kolom database lain tetap memakai jalur pagination sebelumnya.

Verifikasi: TypeScript lulus; lint hanya peringatan hook lama pada phone.tsx. Tes sintetis pengurutan, nilai kosong, scope pemilik/filter, minimum/adaptasi, pagination, handler API, round-trip pencarian, dan regresi kontrol kebijakan lulus. Build Next.js/TypeScript staging lulus.

Browser produksi berautentikasi: semua tiga header diuji naik/turun, aria-sort dan URL sesuai; kuota menurun menampilkan 12, 7, 3, 3, 3 pada halaman pertama dan 2, 1, 1, 1, 1 pada halaman kedua. Sorting baru mengembalikan halaman ke 1. Tidak mengubah kebijakan atau mengirim pesan. Nilai kesehatan seluruh perangkat yang tampak masih belum cukup; perbedaan skor dan interval diuji dengan fixture sintetis.

Build aktif: `OVUkOiS4z66zrCC_FUo3d`.

Backup: `/home/jeblast/backups/doran-phone-policy-sort-1792206854`.

Log: `deployment/phone-policy-sort-deploy-20261017.log`.

Screenshot: `output/phone-policy-sort-after.jpg`.

PM2 online, HTTP startup lulus, WhatsApp/antrean aktif, PID Telegram tetap, hash manifest cocok. Staging dibersihkan dan retensi backup selesai.
