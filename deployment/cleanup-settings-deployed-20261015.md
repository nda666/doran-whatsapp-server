# Perbaikan staging deploy dan label pengaturan

Deployed 15 Oktober 2026. Build ID: `1MoAH_dJeAgPMEKWDuy3U`.

Backup: `/home/jeblast/backups/doran-cleanup-settings-1792024865`.

- Audit memastikan 106 direktori staging tidak dipakai proses aktif atau symlink aplikasi; direktori tidak berupa Git checkout, symlink, atau aplikasi produksi. Daftar dan inode disimpan pada `/home/jeblast/backups/repo-stage-cleanup-plan-20261015.json`.
- 106 direktori staging lama (5614,3 MiB) dibersihkan. Direktori aplikasi utama dan seluruh backup dipertahankan.
- `StageCleanup` menghapus direktori staging milik deploy pada keberhasilan, kegagalan build, dan setelah rollback berhasil. Staging dipertahankan jika pemulihan runtime gagal. Cleanup saat build gagal dan deploy berhasil telah teramati langsung pada proses ini.
- Script deploy utama dan pola deploy berikutnya memakai helper ini; script lama didokumentasikan sebagai arsip.
- Checkbox umum “Reset pengaturan perangkat ke nilai awal” diganti “Kosongkan webhook dan kembalikan preferensi WhatsApp ke bawaan”, dengan rincian setting dan penjelasan bahwa token/sesi/autentikasi/kontak/riwayat/aturan mengikuti checkbox masing-masing.
- Tes unit, TypeScript, build produksi Linux, API live, serta tampilan browser lulus. Token perangkat lama tetap utuh, fixture tes dibersihkan.

Bukti UI: `output/phone-cleanup-settings-live-20261015.png`.
