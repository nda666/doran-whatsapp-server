# Assignment akses nomor

Admin: buka **Perangkat WhatsApp → Kepemilikan → Assign user**, cari user aktif yang sudah disetujui, lalu simpan. Satu perangkat diberikan ke satu user; satu user dapat menerima beberapa perangkat. Kosongkan pilihan untuk mengembalikan akses ke pemilik perangkat.

Assignment tersimpan pada `phones.assignedUserId`. Pemilik teknis (`userId`), sesi WhatsApp, token device, dan riwayat tetap utuh. Device token yang telah dipakai integrasi tetap berlaku. Token user mengikuti assignment terbaru. Perangkat lama tanpa assignment tetap dapat diakses pemiliknya. Administrator utama tetap dapat mengakses semua perangkat.

Filter diterapkan di API untuk perangkat dan pengaturannya, percakapan/lampiran, balasan otomatis, antrean/reset, laporan, ringkasan, pencarian, serta log. Kontak, templat, dan berkas pribadi tetap mengikuti akun pengguna; sinkronisasi kontak dari nomor yang diberikan masuk ke akun operator. Kampanye pribadi hanya dapat diakses bila semua perangkat kampanye masih dapat diakses. Fallback grup pengirim dibatasi pada perangkat dengan assignment yang sama. QR dan status realtime ditujukan ke user yang saat itu memiliki akses.

Plugin AI, Administrasi, Master paket, Grup pengirim, konsol antrean global, pembuatan perangkat, dan pemindahan pengirim antrean memerlukan administrator utama. Halaman Plugin AI juga memiliki pemeriksaan server, di samping menu dan API.

## Migrasi

Terapkan `20261025000000_phone_assignment` dengan `npm run migrate:prod`, kemudian generate Prisma Client dan build/restart aplikasi seperti biasa. Pastikan environment mengarah ke database yang dimaksud. Tidak ada deployment produksi dari pekerjaan ini.

Database development `wa_local` sudah dimigrasikan. Catatan migrasi channel diselaraskan setelah kolom yang ada diverifikasi sama persis dengan SQL migrasi. Pengujian database membuat fixture dalam satu transaksi dan selalu melakukan rollback:

```powershell
node deployment/verify-phone-assignment.cjs
```

Pengujian meliputi penolakan user non-admin, assignment/pencabutan, konflik assignment lama, isolasi perangkat dan antrean meskipun filter ID dimanipulasi, percakapan lintas user, log untuk nomor identik dengan pemilik berbeda, serta token device yang tetap utuh.
