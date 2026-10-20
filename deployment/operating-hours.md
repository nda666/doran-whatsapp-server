# Jam operasional pengiriman

## Pengaturan

- **Administrasi → Setting global → Jam operasional pengiriman (WIB)**:
  aktifkan pembatasan, isi jam mulai dan selesai. Default **24 jam**, sehingga
  penambahan fitur tidak mengubah waktu pengiriman yang sudah berjalan.
- **Perangkat → Aksi → Atur batas → Ikuti jam operasional global**:
  aktif untuk mengikuti global. Matikan untuk mengatur jam khusus nomor tersebut.
  Jadwal khusus **menggantikan** jadwal global; nomor khusus juga dapat dipilih
  24 jam. Pilih mengikuti global lagi untuk menghapus override.
- Kolom **Jam operasional** pada daftar perangkat menampilkan jadwal efektif,
  sumber global/khusus, dan waktu buka berikutnya ketika sedang tutup.

Jadwal berlaku setiap hari dalam **WIB (UTC+7)**, tanpa mengikuti zona waktu mesin
server/browser. Jam mulai termasuk; jam selesai tidak termasuk. `08:00–20:00`
berarti boleh mengirim mulai 08:00 sampai sebelum 20:00. `22:00–06:00` mencakup
malam hari hingga sebelum 06:00 esok harinya. Format 00:00–23:59; jam mulai dan
selesai tidak boleh sama ketika pembatasan aktif. Matikan pembatasan untuk 24 jam.

## Alur pengiriman

Worker memeriksa jadwal efektif setiap calon nomor sebelum claim. Dalam grup,
nomor utama yang sedang tutup dilewati dan cadangan yang sedang buka dapat
dipilih, selama juga memenuhi koneksi, kesehatan, kuota, interval, dan lease.
Jika tidak ada pengirim yang tersedia karena jadwal, pesan tetap `QUEUED` dengan
`OUTSIDE_OPERATING_HOURS`, tanpa menambah attempts maupun kuota.

Pengecekan diulang sekitar 30 detik ditambah jeda polling. Perubahan pengaturan
global maupun nomor berlaku pada pemeriksaan berikutnya, tanpa restart. Job lain
dalam grup tetap dapat diproses ketika job terdahulu menunggu jadwal pengirimnya.
Batas usia antrean tetap dihitung selama menunggu; pesan dapat kedaluwarsa sebelum
jadwal berikutnya jika batas usia sudah terlewati.

Boundary transport `reserveSend` memeriksa jadwal lagi sebelum mereservasi kuota.
Jika jadwal tutup setelah claim, worker mengembalikan pesan ke antrean dan
mengembalikan attempts tanpa memakai kuota; riwayat claim tercatat `SKIPPED`.
Pemeriksaan ini berlaku juga pada jalur kirim lain yang memakai socket bersama.
Permintaan pengiriman langsung tanpa antrean ditolak di luar jadwal; fitur ini
tidak mengubah jalur langsung tersebut menjadi antrean.

Pesan yang sudah memiliki message ID tetap terikat ke pengirim sebelumnya, termasuk
ketika jadwal pengirim itu tutup. Pesan menunggu pembukaan jadwal dan melanjutkan
retry dengan message ID yang sama. Receipt yang datang ketika jadwal tutup tetap
diproses. ID pengiriman kasir, token asal, store, transaksi dan webhook tetap sama.

## Penyimpanan dan kompatibilitas

- Global: `global_settings.key = dispatch-operating-hours`, nilai JSON terenkripsi
  `{"enabled":true,"start":"08:00","end":"20:00"}`.
- Nomor: `device_send_policies.operatingHours`, JSON yang sama atau SQL NULL untuk
  mengikuti global.
- `PUT /api/device-policies` menerima `operatingHours` opsional. NULL menghapus
  override. Tidak mengirim field tersebut mempertahankan override yang tersimpan,
  sehingga client lama tidak menghapus jadwal saat memperbarui kuota/jeda.
- API memvalidasi jadwal dan membatasi perubahan nomor sesuai pemilik akun.

## Pemasangan dan verifikasi

CI/CD produksi menerapkan tambahan `20261020040000_operating_hours` sesudah grup
pengirim melalui helper khusus sesudah backup, tanpa replay migrasi lama. Untuk
database lokal/CI baru, gunakan migrasi normal. Kemudian
jalankan Prisma generate dan build, lalu mulai ulang aplikasi/worker. Pengaturan
global default muncul ketika Setting global dibuka; sebelum ada baris pengaturan,
runtime juga memakai default 24 jam. Belum ada jadwal produksi yang diaktifkan oleh
implementasi ini.

- `node deployment/verify-operating-hours.cjs`: batas waktu WIB, lewat tengah malam,
  pergantian tanggal, waktu buka berikutnya, validasi dan override.
- `node deployment/verify-dispatch-ack-retry.cjs`: regresi timeout, stable message ID,
  receipt terlambat, penolakan 463 dan batas retry.
- `node deployment/verify-sender-groups.cjs`: MySQL nyata dengan transport tiruan;
  migrasi kedua fitur, API pengaturan, scope pemilik, antrean di luar jadwal,
  cadangan yang sedang buka, perubahan jadwal sesudah claim, dan retry terikat
  pengirim. Gunakan database uji localhost baru sesuai panduan grup pengirim.
