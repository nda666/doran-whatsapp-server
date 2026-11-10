# Pengelolaan auth WA otomatis — 10 November 2026

Build produksi: `iUI5jE4TdQyqb2COEm8Yj`.
Backup: `/home/jeblast/backups/doran-auth-lifecycle-1794304198`.
Tidak ada migrasi schema, pergantian token API atau pemangkasan kunci Signal aktif
berdasarkan umur/jumlah. Patch menggunakan baseline source produksi; perubahan
lokal lain yang belum dideploy tidak ikut masuk.

## Temuan audit

Snapshot sebelum perbaikan berisi 881.041 baris auth dan nol baris tanpa perangkat.
Kelompok terbesar adalah `lid-mapping` (375.620) dan `pre-key` (348.103), bukan
file yatim. Ada 13.887 entri `tctoken`; perangkat terbesar memiliki 144.066 baris.
Jumlah besar sendiri bukan bukti sebuah kunci sudah tidak dibutuhkan.

Library terpasang memiliki pruner token sementara yang bergantung pada index JID
dan event online. Adapter lama juga melakukan satu upsert/delete per kunci,
sehingga satu commit besar mudah melampaui batas waktu dan menahan cleanup.

## Perubahan

- Worker berjalan tiap menit, sesudah startup grace dua menit, maksimal empat
  perangkat per putaran. Token dipindai 200 baris per perangkat/putaran, dengan
  checkpoint hash/cursor dan indeks yang disimpan atomik dalam
  `storage/auth-maintenance/checkpoints.json` (direktori 0700, berkas 0600).
- Hanya token `tctoken` yang kedaluwarsa menurut empat bucket mingguan library
  yang dihapus. Sender timestamp yang masih berlaku dipertahankan. Format yang
  tidak dikenali, data rusak, kunci identitas, pre-key, sesi, sender-key, mapping
  dan app-state dipertahankan. Indeks token dibersihkan maksimal 200 referensi
  per putaran, termasuk entri yang tidak pernah masuk indeks library.
- Pemeliharaan owner aktif memakai lease dan lock baris auth yang sama, tetapi
  terpisah dari promise antrean Signal. Kegagalan maintenance tidak meracuni
  antrean penulisan atau memutus socket sehat.
- State tanpa perangkat dan sisa reset yang ditandai secara eksplisit dibersihkan
  200 baris per transaksi. Lease auth/sender aktif dilindungi. Reset yang sudah
  kosong difinalisasi juga, termasuk bila pengguna sempat mengaktifkan perangkat.
- File JSON auth legacy yang sudah dimigrasikan ke DB dapat dibersihkan 100 file
  per perangkat/putaran, hanya jika creds DB terbaca, berumur minimal 24 jam dan
  mtime tidak lebih baru dari migrasi. Tidak rekursif, tidak mengikuti symlink,
  tidak menghapus file baru/non-JSON, media atau backup. `creds.json` dihapus
  terakhir saat hanya file itu yang tersisa.
- Penulisan Signal tetap satu transaksi atomik. Delete memakai kelompok 200 hash;
  upsert memakai SQL berparameter, maksimal 100 baris atau sekitar 1 MiB per
  perintah. Urutan last-write-wins per hash dan enkripsi/AAD tetap dipertahankan.
  Simulasi 20.000 upsert + 19.000 delete memerlukan 295 perintah, bukan 39.000.
- Jumlah kunci disampel harian dan store >=50.000 dicatat sebagai peringatan,
  bukan alasan logout atau penghapusan. `/health/auth-storage` hanya untuk admin,
  memuat hasil putaran, error, jumlah yang dibersihkan dan store besar. Tiga
  kegagalan berturut-turut atau putaran yang macet >10 menit menghasilkan 503.

## Validasi dan deployment

- Typecheck/lint lulus, dengan peringatan React Hook lama.
- Uji offline: batas kedaluwarsa dibandingkan dengan helper library terpasang,
  pagination, perlindungan bit-for-bit kunci aktif/perangkat lain, dedupe sender,
  indeks, 39.000 mutasi, rollback atomik, fencing lease, kegagalan maintenance yang
  tidak mematikan Signal, reset kosong dan checkpoint setelah restart.
- Uji filesystem: grace period, marker migrasi, file baru/non-JSON, traversal ID,
  symlink dan penghapusan kredensial legacy terakhir.
- Uji MySQL nyata: 1.003 auth key sintetis pada UUID tanpa perangkat terdaftar,
  upsert/delete massal, rollback, expiry dan indeks. Seluruh fixture dibersihkan.
- Build Next/server, suite hardening dan seluruh CI lulus pada staging Linux.
  Koreksi terakhir hanya pada service backend/test; dipastikan tidak terdapat di
  bundle Next, lalu server dikompilasi ulang dan seluruh CI diulang hingga lulus.
- Backup database konsisten dibuat saat layanan tetap online, sebelum promosi.
  Audit jumlah tabel dan metadata migrasi sama saat pertukaran runtime. Rollback
  otomatis tersedia. Staging dihapus setelah promosi berhasil.

Pertumbuhan kunci yang masih diperlukan tetap dimungkinkan; menghapusnya untuk
sekadar menurunkan angka dapat merusak sesi. Perbaikan ini membatasi pekerjaan
pembersihan, menghapus state yang terbukti aman dibuang dan menghilangkan biaya
ribuan round-trip untuk operasi auth besar.

## Bukti produksi setelah aktivasi

`/health/auth-storage` mengembalikan 200/healthy, lastSuccessAt terisi, failures=0,
80 token usang telah dihapus dan 400 file legacy dibersihkan pada snapshot awal.
Delapan perangkat sudah disampel; checkpoint nyata tersimpan dengan mode 0600.
Permintaan tanpa kredensial admin ditolak 401. Pemeriksaan aplikasi menghasilkan
`LOGIN_DATABASE_DISPATCH_READY`; keempat proses PM2 terkait online, 56 perangkat
online. Peringatan sender offline dengan backlog sudah ada sebelumnya.

Putaran awal sempat mengalami P2028 saat startup; retry berikutnya pulih dan
failure counter kembali nol. Ini membuktikan maintenance dapat gagal/retry tanpa
meracuni antrean Signal. Tidak ada janji jumlah kunci aktif selalu kecil ataupun
jaminan seluruh gangguan server/provider tidak mungkin terjadi; scope proteksi
dan pemulihannya terukur seperti di atas.

Retensi backup lintas-deploy tidak dijalankan paralel dengan retensi lama yang
masih aktif. Target retensi lama dipastikan tidak mencakup backup terbaru, yang
runtime rollback-nya diverifikasi tetap utuh. Proses lama dilanjutkan dengan nice
19 dan I/O idle agar layanan WA diprioritaskan; tidak ada proses aplikasi yang
diturunkan prioritasnya.

Snapshot akhir: lastSuccessAt terus maju, failures=0, 230 auth key usang dan
1.000 file legacy telah dibersihkan, 24 perangkat sudah disampel/checkpoint.
Putaran berikutnya sedang berjalan; aplikasi/worker sehat dan 56 perangkat tetap
online. Ini memverifikasi lebih dari satu putaran, bukan hanya startup berhasil.
