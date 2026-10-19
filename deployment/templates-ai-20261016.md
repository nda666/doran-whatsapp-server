# Template pesan internal dan Plugin AI

Implementasi menambahkan menu Template Pesan dan Plugin AI pada dashboard. Data template dan kredensial provider dipisahkan per akun, termasuk akun admin. Template adalah teks siap pakai, bukan template resmi WhatsApp Business Platform.

## Penggunaan

1. Buat template di Template Pesan. Isi nama dan pesan; variabel dapat ditulis sebagai `{nama}`, `{nomor}`, `{produk}`, atau `{nama_variabel}`. Nama variabel diawali huruf, maksimal 40 karakter, lalu huruf/angka/garis bawah.
2. Klik Pilih template pesan pada campaign, percakapan, auto reply teks, atau Test Kirim. Isi variabel dan periksa pratinjau. Pada campaign, `{nama}` dan `{nomor}` tetap dipersonalisasi untuk setiap penerima. Pemilihan mengisi teks formulir; tidak mengirim pesan. Edit template tidak mengubah pesan yang sudah masuk antrean.
3. Buka Plugin AI di akun pemilik perangkat. Pilih OpenAI, Gemini AI, atau Claude AI; isi API key, ID model yang tersedia pada akun provider, instruksi bisnis, dan batas permintaan. API key tidak pernah dikembalikan ke browser setelah disimpan.
4. Aktifkan dan simpan provider, kemudian gunakan Uji koneksi & balasan. Uji ini menggunakan kuota API provider dan hanya menampilkan hasil di dashboard.
5. Pada Perangkat HP, aktifkan Balasan Otomatis dan buat aturan Auto Reply dengan jenis Balasan AI. Pilih provider, kata kunci, cakupan pesan pribadi/grup, serta instruksi tambahan bila diperlukan. Cakupan AI baru secara default adalah pesan pribadi. Aktifkan aturan tersebut.

AI menerima teks pesan masuk (maksimal 4.000 karakter) dan instruksi sistem/aturan; tanpa riwayat chat atau isi lampiran. AI bekerja pada pesan notify baru berusia maksimal 5 menit. Pesan dari diri sendiri, status/broadcast, dan sinkronisasi append dilewati. Pesan yang sama hanya dicoba sekali berdasarkan akun/perangkat/JID/ID pesan. Jika pengiriman tidak pasti, status UNCERTAIN tidak dikirim ulang otomatis. Jika beberapa aturan AI cocok, urutan ID aturan menentukan percobaan pertama; aturan biasa tetap mengikuti perilaku aplikasi sebelumnya.

Batas per menit adalah jendela berjalan 60 detik; batas harian kembali pada 00.00 WIB. Semua perangkat dan pengujian koneksi memakai kuota provider yang sama dalam satu akun. Percobaan gagal tetap dihitung. Riwayat aktivitas menyimpan status/kode error saja, tanpa teks prompt atau jawaban. Tidak ada fallback otomatis ke provider lain.

## Persiapan server dan deploy

Jangan memasukkan API key provider ke kode atau bundle browser. API key diisi pada menu Plugin AI setelah deploy.

1. Buat kunci enkripsi sekali pada server tujuan:

   ```sh
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

2. Simpan hasilnya sebagai `AI_SECRET_KEY` pada environment server (64 karakter hex). Pertahankan nilai yang sama pada semua proses/worker dan deploy berikutnya. Cadangkan secara aman bersama konfigurasi server. Mengganti kunci membuat API key tersimpan tidak dapat dibaca; API key perlu diisi ulang.
3. Cadangkan database sebelum migrasi. Gunakan staging/deploy terisolasi sesuai deployment/README.md, dan jalankan:

   ```sh
   npm ci
   npx prisma generate
   npm run build
   npx prisma migrate deploy
   ```

   Migrasi fitur: `prisma/migrations/20261016110000_templates_ai_plugins/migration.sql`. Migrasi menambah tiga tabel dan nilai enum `ai`; tidak menghapus data lama. Terapkan migrasi sebelum mengaktifkan runtime baru. Hindari `prisma db push`/reset untuk database produksi.
4. Promosikan runtime dan restart proses dengan environment baru. Periksa menu template, isolasi data antar akun, pengaturan AI, dan uji balasan provider memakai API key milik pengguna. Pengujian WhatsApp dilakukan pada nomor uji yang ditentukan pengguna.

## Pemeriksaan lokal

```sh
node deployment/verify-templates-ai.cjs
npx prisma validate
npx tsc --noEmit --incremental false
npm run build
```

Verifier memakai database/provider/socket tiruan dan tidak mengirim pesan atau permintaan berbayar. Memeriksa substitusi variabel, batas input, kepemilikan template, enkripsi dan redaksi API key, tiga format REST, penanganan error, kuota, deduplikasi, pesan lama/fromMe, pembatalan aturan, serta mempertahankan/menghapus key.

Pemeriksaan browser lokal tersedia pada `deployment/verify-templates-ai-ui.cjs` (Playwright + Chrome). Seluruh endpoint API diintersep dengan fixture di memori. Jalankan dengan server lokal di port 3107, atau set `DORAN_UI_START_SERVER` ke direktori hasil build terisolasi agar pengujian menjalankan dan menutup servernya sendiri. Gunakan secret sesi pengujian `local-build-check-only` hanya pada server fixture ini; jangan gunakan pada aplikasi sebenarnya. Screenshot disimpan di `output/templates-ai`.

## Referensi API provider

- OpenAI Responses: https://developers.openai.com/api/docs/guides/migrate-to-responses
- Gemini generateContent: https://ai.google.dev/api/generate-content
- Claude Messages: https://platform.claude.com/docs/en/api/messages/create

OpenAI memakai Responses REST dengan `store: false`; Gemini memakai generateContent; Claude memakai Messages API. Output yang kosong, dibatasi, atau terpotong tidak dikirim ke WhatsApp. Model diisi eksplisit agar dapat disesuaikan dengan akses akun provider tanpa bergantung pada alias/model bawaan yang dapat berubah.
