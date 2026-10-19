# Deploy aplikasi

CI/CD GitHub Actions tersedia di `.github/workflows/ci.yml`.
Lihat [CI-CD.md](CI-CD.md) untuk checks, aktivasi SSH, backup, rollback,
dan batas pemeriksaan data. Gunakan jalur ini untuk deploy seluruh commit.

Gunakan pola deploy terisolasi terbaru pada `deploy-reset-preset-20261015.py` dan helper `stage_cleanup.py` serta `backup_retention.py` sebagai acuan deploy berikutnya.

- Bangun di staging yang dibuat sendiri di bawah `/home/jeblast/repos/.doran-*`.
- Aktifkan `StageCleanup` segera setelah staging dibuat. Folder staging dibersihkan saat build gagal, deploy berhasil, atau rollback berhasil.
- Set `preserve=True` selama promosi runtime. Jika rollback gagal, staging dipertahankan untuk pemulihan.
- Backup source, runtime lama, manifest dan log tetap berada di `/home/jeblast/backups`.
- Setelah build, promosi dan pemeriksaan kesehatan berhasil, simpan satu backup deploy yang berisi versi sebelum aplikasi aktif. Hapus backup versi deploy yang lebih lama. Cadangan database/sesi/storage pada versi lama dipindahkan ke `backups/data-backups` sebelum direktori versi dihapus. Konfigurasi PM2 terpisah dan direktori yang dipakai proses aktif dipertahankan.
- Jangan menjalankan retensi saat build/deploy/rollback gagal; simpan berkas pemulihan sampai berhasil dipulihkan.
- Script `deploy-*.py` lama merupakan arsip per perubahan. Jangan menyalin pola lamanya tanpa menambahkan cleanup.
- Pembersihan folder lama memakai audit eksplisit melalui `cleanup-old-repo-stages.py`, kemudian `--apply`. Pemeriksaan melindungi checkout produksi, symlink, Git checkout, dan direktori yang dipakai proses aktif.
