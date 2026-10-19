# Menu composer dan panduan API key — deployed 16 Oktober 2026

Kedua perubahan telah di-deploy ke https://dashboard.jeblast.com setelah pengguna menyetujui deployment gabungan.

- Build aktif: `lDA1CXFTR1p5XHmWFZG5k`; sebelumnya `p-wNNmFoZ9uwi0RBO9ufa`.
- Percakapan: tombol `+` membuka Foto & video, Dokumen, Audio, dan Template pesan dalam composer satu baris.
- Plugin AI: panduan pembuatan API key OpenAI, Gemini, dan Claude; tautan resmi; penjelasan pengaturan, kuota/biaya, pengujian dan kendala umum.
- Paket lima berkas diverifikasi terhadap baseline source server sebelum build/promosi.
- Build terisolasi dan pemeriksaan regresi lulus. Uji API percakapan di staging serta template/AI pada produksi lulus; fixture dibersihkan. Tidak ada pesan WhatsApp atau permintaan AI eksternal yang dikirim oleh pengujian.
- Proses Doran WhatsApp online; PID proses logrotate, Telegram sender, dan backend SMS tetap sama.
- Pemeriksaan domain publik menunjukkan build terbaru. Pengguna tanpa sesi diarahkan ke login.
- Backup source/runtime sebelumnya dan log: `/home/jeblast/backups/doran-composer-ai-guide-1792142924`. Staging telah dihapus. Retensi menyimpan satu backup deploy dan memindahkan backup data dari versi lama sesuai kebijakan.
- Konfigurasi enkripsi AI tetap tersedia. Tidak ada migrasi database atau perubahan konfigurasi provider pada deployment UI ini.

Hasil terstruktur: `deployment/composer-ai-guide-deployed-20261016.json`.
