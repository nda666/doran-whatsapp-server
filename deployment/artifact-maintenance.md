# Otomatisasi artefak WA server

Helper aktif: `/home/jeblast/repos/doran-ops/artifact-maintenance.py`.
Cron akun `jeblast` menjalankannya setiap 15 menit; tidak ada restart aplikasi.
Laporan terakhir berada di `repos/doran-ops/latest.json` dan output cron di
`repos/doran-ops/latest.log` (ditimpa setiap run agar tidak menumpuk).

Helper memegang lock CD yang sama dan memeriksa dashboard sebelum/sesudah.
Jika deployment sedang berlangsung atau pemeriksaan keamanan gagal, cleanup
berhenti. Database, storage WhatsApp, upload pengguna, PM2, Node, dan backup
pemulihan tidak termasuk target penghapusan.

Langkah cleanup GitHub Actions memakai helper dari checkout hasil deployment
dengan `--incoming-commit SHA`, sehingga hanya incoming di `repos` untuk commit
tersebut yang dapat dihapus. Job lain dan folder pekerjaan tidak disentuh.
Bukti sukses dapat berasal dari backup baru `repos/doran-backups` maupun backup
legacy `backups`; kedua lokasi backup tetap dipertahankan.

Incoming yang checksum-nya cocok dengan deployment sukses dan berkas backup
runtime/database hanya dihapus setelah tidak ada pengguna aktif dan tidak berubah
minimal lima menit. Daftar isi dibatasi ke source archive, checksum, dan script
deployer yang dikenal. Incoming gagal di home dipindah ke `repos` setelah tidak
aktif; tidak dihapus tanpa bukti sukses. Nama/path lama dan baru didukung agar
jadwal server tetap bekerja sebelum perubahan workflow dipush.

Folder pekerjaan hanya dibersihkan melalui `artifact-manifest.json`:

```json
{
  "version": 1,
  "state": "completed",
  "files": [
    {"name": "temporary.py", "sha256": "SHA256_LENGKAP_SETELAH_PEKERJAAN_SELESAI"}
  ]
}
```

Manifest harus dibuat setelah pekerjaan selesai dan diverifikasi. Helper hanya
menghapus file yang terdaftar, checksum masih sama, tidak dirujuk kode/cron, dan
tidak dipakai proses. Isi lain dan manifest dipertahankan. Folder legacy tanpa
manifest tidak dihapus. File acak di home dicatat untuk audit, tidak ditebak
kegunaannya dan tidak dihapus otomatis.

Validasi: `python3 deployment/test-artifact-maintenance.py` pada Linux.
Audit tanpa perubahan: `python3 repos/doran-ops/artifact-maintenance.py --dry-run`
dari `/home/jeblast`. Lokasi ini khusus artefak WA; tidak menggantikan maintenance
data aplikasi yang sudah ada pada pukul 00.00 WIB.
