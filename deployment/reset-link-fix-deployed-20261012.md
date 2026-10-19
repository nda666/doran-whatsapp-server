# Perbaikan tautan reset password

Aktif pada https://dashboard.jeblast.com/reset-password, 12 Oktober 2026.

Build: `FaqhiF-fi9kN8crFCDmvY`.

Backup VPS: `/home/jeblast/backups/doran-reset-link-fix-1791819490`.

Bug direproduksi di browser produksi dengan token uji: form password muncul pada mount pertama, kemudian halaman menampilkan tautan tidak valid setelah proses inisialisasi/hydration memount halaman kembali. Effect sebelumnya menghapus fragment segera setelah pembacaan token, sehingga instance halaman berikutnya kehilangan token.

Perbaikan: pertahankan fragment URL selama form reset digunakan. Hapus fragment hanya setelah API berhasil mereset password, dan pertahankan `window.history.state` milik Next.js. Tidak ada perubahan token database, masa berlaku, pemeriksaan token, atau konfigurasi Postmark.

Tes regresi `verify-reset-page-hydration.cjs` memastikan token tetap terbaca pada mount berulang dan fragment hanya dibersihkan setelah sukses. Tes ini lulus bersama lint, build produksi, dan `verify-reset-link-live.cjs`. Pengujian browser memakai token uji, tanpa mengubah password pengguna atau mengirim email.
