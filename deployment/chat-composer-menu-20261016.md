# Perbaikan composer Percakapan

Tombol template terpisah diganti dengan menu `+` pada satu baris bersama kolom pesan dan tombol Kirim. Menu terbuka ke atas dengan pilihan Foto & video, Dokumen, Audio, dan Template pesan. Pilihan lampiran mengatur filter file. Template tetap membuka dialog dengan variabel penerima, lalu mengisi draf tanpa mengirim otomatis. Tampilan ponsel memakai tombol Kirim berbentuk ikon. Status offline, kiriman tertunda, dan penghapusan percakapan tetap menonaktifkan menu.

Berkas: `src/pages/dashboard/conversations.tsx`, `src/styles/Conversations.module.css`, dan `src/components/MessageTemplatePicker.tsx`. Picker menerima renderTrigger opsional; halaman lain tetap memakai tombol bawaan.

Verifikasi lulus: TypeScript tanpa emit; verifier template/AI yang ada; browser lokal untuk menu, pemilihan template berpersonalisasi, filter ketiga jenis lampiran, lebar ponsel tanpa overflow, tombol satu baris, serta penjagaan perangkat offline. Tidak ada pesan dikirim. Screenshot: `output/chat-composer-menu/desktop-menu.png`, `desktop-composer.png`, dan `mobile-menu.png`.

Paket deployment tiga berkas dan baseline server tersedia pada `deployment/chat-composer-menu-20261016.zip`. Skrip staging/backup/rollback: `deployment/deploy-chat-composer-menu-20261016.py`.

Telah diterapkan ke produksi bersama panduan API key setelah pengguna memberikan persetujuan deployment gabungan. Lihat `deployment/composer-ai-guide-deployed-20261016.md`.
