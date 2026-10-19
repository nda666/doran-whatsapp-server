# Template Pesan dan Plugin AI — deployed 16 Oktober 2026

Deploy berhasil ke https://dashboard.jeblast.com.

- Build aktif: `p-wNNmFoZ9uwi0RBO9ufa` (sebelumnya `Zhe6pYkj5VkvxJFIxAbiZ`).
- Migrasi `20261016110000_templates_ai_plugins` berhasil diterapkan.
- `AI_SECRET_KEY` dibuat pada environment server, tanpa ditampilkan atau disalin ke workspace. API key provider tetap diisi sendiri pada menu Plugin AI.
- Backup database sebelum migrasi: 79.532.590 byte, tersimpan di `/home/jeblast/backups/doran-templates-ai-1792131572/database-before.sql`. Folder yang sama menyimpan runtime/source/client lama, environment terlindungi, manifest, serta log build/migrasi/pengujian. Satu backup deploy sebelumnya dipertahankan sesuai kebijakan retensi.
- Build dan Prisma client dibuat terisolasi. Client produksi tetap utuh selama build; runtime/client baru dipromosikan setelah pengujian staging berhasil.
- Uji API dengan database sebenarnya lulus pada staging dan produksi: autentikasi, CRUD template, isolasi antar akun, enkripsi dan penyembunyian key, konfigurasi tiga provider, penjagaan provider nonaktif, penyimpanan aturan AI, dan halaman dashboard. Seluruh akun/perangkat/data fixture dibersihkan. Tidak ada API AI eksternal atau pesan WhatsApp yang dikirim oleh pengujian.
- Doran WhatsApp online. PID Telegram sender, backend SMS, dan logrotate tidak berubah.
- Domain publik mengembalikan halaman login HTTP 200 dengan build terbaru; kedua halaman baru mengarahkan pengguna tanpa sesi ke login seperti yang diharapkan.
- Staging `.doran-templates-ai-1792131572` telah dibersihkan setelah deploy dan pemeriksaan kesehatan berhasil.

Menu: `/dashboard/message-templates` dan `/dashboard/ai-plugins`.

Untuk memakai AI, isi API key dan ID model pada akun pemilik perangkat, simpan/aktifkan provider, lalu buat aturan Auto Reply dengan jenis Balasan AI. Konektivitas ke provider dengan kredensial nyata belum diuji karena API key pengguna belum dimasukkan.

Hasil pemeriksaan terstruktur: `deployment/templates-ai-deployed-20261016.json`.
