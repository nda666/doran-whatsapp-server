# Setting PM2 & pemasangan ulang Jeblast

Konfigurasi utama adalah **`ecosystem.config.js` di root proyek**. Gunakan file tersebut ketika deploy ulang; jangan mengandalkan konfigurasi yang hanya tersimpan di daemon PM2.

## Konfigurasi yang disimpan — 12 Oktober 2026

| Pengaturan | Nilai |
| --- | --- |
| Nama aplikasi | `doran-whatsapp` |
| Entry point | `dist/src/server/index.js` |
| Runtime aplikasi | Node.js `24.21.0` |
| Mode / instance | `fork` / `1` |
| Auto-restart / watch | `true` / `false` |
| Ambang RAM total | `6144M` (6 GiB) |
| Heap JavaScript | `--max-old-space-size=4096` |
| Backoff restart awal | `1000` ms |
| Timeout PM2 | `65000` ms |
| Timestamp log | `YYYY-MM-DD HH:mm:ss Z` |
| Host / port default | `127.0.0.1` / `3000` |
| WhatsApp / dispatch | aktif / aktif |
| Queue Redis | nonaktif |
| Concurrency / interval dasar | `4` / `1000` ms |

`cwd: __dirname` menyesuaikan direktori kerja dengan lokasi proyek. Interpreter default mengarah ke Node 24.21.0 di VPS saat ini. Pada server lain, sesuaikan nilai `interpreter` dalam file atau pasang `DORAN_NODE_PATH` pada perintah start **dan** startup reboot.

## Deploy ulang dari awal

1. Siapkan source proyek lengkap, Node.js yang sesuai, PM2, database, dan proxy domain. PM2 yang terverifikasi saat penyimpanan adalah versi `5.4.2`.
2. Pulihkan `.env`, database, folder `storage` (termasuk auth perangkat), dan upload pengguna secara terpisah. Paket setting PM2 tidak memuat data atau kredensial tersebut.
3. Di root proyek, instal dependency dan compile:

```bash
npm ci
npx prisma generate
WHATSAPP_ENABLED=false QUEUE_ENABLED=false DISPATCH_QUEUE_ENABLED=false \
  NODE_OPTIONS=--max-old-space-size=8192 npm run build
```

4. Jika database membutuhkan migration proyek, jalankan `npx prisma migrate deploy` setelah backup dan pemeriksaan kompatibilitas. Tidak perlu menjalankan ulang migration yang sudah diterapkan.
5. Pastikan `.next/BUILD_ID` dan `dist/src/server/index.js` tersedia, lalu aktifkan konfigurasi:

```bash
pm2 startOrReload ecosystem.config.js --only doran-whatsapp --update-env
pm2 save
pm2 describe doran-whatsapp
curl -fsS http://127.0.0.1:3000/signin >/dev/null
```

Flag nonaktif pada perintah build hanya berlaku untuk proses build. `ecosystem.config.js` mengaktifkan flag produksi saat aplikasi mulai. Gunakan `--only doran-whatsapp` agar aplikasi lain tidak ikut direstart.

## Startup setelah reboot

VPS saat ini menggunakan cron milik user `jeblast`:

```cron
@reboot /usr/local/bin/pm2 start /home/jeblast/repos/doran-whatsapp-server/ecosystem.config.js --only doran-whatsapp >> /home/jeblast/.pm2/dashboard-startup.log 2>&1
```

Untuk server baru, sesuaikan user serta path PM2/proyek/Node, dan pasang satu entri startup yang sesuai. Jangan menambahkan entri duplikat. Setelah perubahan proses jalankan `pm2 save`. Snapshot `dump.pm2` berada di direktori PM2 user dan berisi environment privat; gunakan file ecosystem sebagai konfigurasi portable.

## Shutdown dan verifikasi

Setting timeout harus dipakai bersama kode shutdown terbaru pada source lengkap proyek: `src/server/gracefulShutdown.ts`, wiring di `src/server/index.ts`, penutupan sesi di `src/server/libs/makeWASocket.ts`, dan guard reconnect di `src/server/events/connectionUpdate.ts`.

Shutdown menangani SIGINT/SIGTERM sekali, menghentikan pekerjaan baru/reconnect, menunggu worker dan penyimpanan auth, menutup koneksi/database, dan memiliki batas internal 60 detik sebelum timeout PM2 65 detik. Menyalin file ecosystem saja tidak menambahkan perilaku shutdown tersebut ke source lama.

Uji offline setelah compile:

```bash
WHATSAPP_ENABLED=false QUEUE_ENABLED=false node deployment/verify-pm2-optimization.cjs
```

Uji read-only pada konfigurasi produksi saat ini:

```bash
node deployment/verify-pm2-optimization-live.cjs
```

Uji live memerlukan akun super admin yang sudah ada. Periksa juga koneksi perangkat, worker, dan log. Riwayat penerapan serta backup rollback dicatat di `deployment/pm2-optimization-deployed-20261012.md`.

## Paket arsip

`deployment/pm2-settings-20261012.zip` berisi konfigurasi, source terkait shutdown, pengujian, panduan ini, dan checksum SHA-256. Ini snapshot setting, bukan installer aplikasi lengkap. Pada deploy baru, gunakan source proyek lengkap yang cocok; jangan menimpa source versi berbeda dengan potongan source arsip tanpa merge.

Perubahan setting berikutnya harus memperbarui `ecosystem.config.js`, panduan, konfigurasi aktif, dan `pm2 save`. Snapshot bertanggal tetap menjadi catatan versi 12 Oktober 2026.
