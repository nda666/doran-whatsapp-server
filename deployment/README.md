# Deploy aplikasi

CI/CD GitHub Actions tersedia di `.github/workflows/ci.yml`.
Lihat [CI-CD.md](CI-CD.md) untuk checks, aktivasi SSH, backup, rollback,
dan batas pemeriksaan data. Gunakan jalur ini untuk deploy seluruh commit.

Semua pekerjaan baru WA server di server harus berada di bawah
`/home/jeblast/repos`, termasuk script, paket, log pekerjaan, laporan, state,
dan backup baru khusus pekerjaan. Ikuti [aturan lokasi proyek](../AGENTS.md).
Komponen operasional lama di luar `repos` dimigrasikan dengan audit dependensi,
pembaruan konfigurasi, rollback, dan pemeriksaan kesehatan aplikasi.
Cleanup artefak terverifikasi berjalan otomatis setiap 15 menit melalui helper
di `repos/doran-ops`; lihat [jadwal, cakupan, dan manifest](artifact-maintenance.md).

Perubahan deduplikasi inbound, streaming media, migration/index dan pengaturan retensi dijelaskan di [inbound-media-retention.md](inbound-media-retention.md).
Pengujian traffic, penghentian sesi akun nonaktif, dan patch dependensi dijelaskan di [traffic-owner-hardening.md](traffic-owner-hardening.md).

Gunakan pola deploy terisolasi terbaru pada `deploy-reset-preset-20261015.py` dan helper `stage_cleanup.py` serta `backup_retention.py` sebagai acuan deploy berikutnya.

- Bangun di staging yang dibuat sendiri di bawah `/home/jeblast/repos/.doran-*`.
- Tempatkan ZIP/TAR, log sementara, dan script Python sekali pakai untuk pekerjaan manual di `/home/jeblast/repos/.doran-work-<id-pekerjaan>/`. Upload CI/CD berada di `/home/jeblast/repos/.doran-incoming-<commit>/`. Periksa keamanan sebelum membersihkan; file operasional dan backup pemulihan tetap di lokasi resminya.
- Aktifkan `StageCleanup` segera setelah staging dibuat. Folder staging dibersihkan saat build gagal, deploy berhasil, atau rollback berhasil.
- Set `preserve=True` selama promosi runtime. Jika rollback gagal, staging dipertahankan untuk pemulihan.
- Backup source, runtime lama, manifest dan log baru berada di `/home/jeblast/repos/doran-backups`. Backup legacy di `/home/jeblast/backups` tetap dipertahankan.
- Setelah build, promosi dan pemeriksaan kesehatan berhasil, simpan satu backup deploy yang berisi versi sebelum aplikasi aktif. Hapus backup versi deploy yang lebih lama. Cadangan database/sesi/storage pada versi lama dipindahkan ke `backups/data-backups` sebelum direktori versi dihapus. Konfigurasi PM2 terpisah dan direktori yang dipakai proses aktif dipertahankan.
- Jangan menjalankan retensi saat build/deploy/rollback gagal; simpan berkas pemulihan sampai berhasil dipulihkan.
- Script `deploy-*.py` lama merupakan arsip per perubahan. Jangan menyalin pola lamanya tanpa menambahkan cleanup.
- Semua pekerjaan deploy/test/audit wajib membersihkan paket ZIP/TAR, log sementara, script Python sekali pakai, dan cache yang dibuat untuk pekerjaan tersebut setelah selesai dan terverifikasi. Catat file sejak awal, periksa dependensi/proses/cron sebelum menghapus, dan ikuti [aturan cleanup proyek](../AGENTS.md). Source Git, log aktif, script operasional, data pengguna, dan backup pemulihan tetap dipertahankan. Simpan bahan diagnosis jika proses gagal; bersihkan setelah masalah selesai.
- Pembersihan folder lama memakai audit eksplisit melalui `cleanup-old-repo-stages.py`, kemudian `--apply`. Pemeriksaan melindungi checkout produksi, symlink, Git checkout, dan direktori yang dipakai proses aktif.
