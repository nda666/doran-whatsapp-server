# Grup pengirim otomatis

Kasir tetap mengirim `api_key` / `token_api` / Bearer sesuai kontrak sebelumnya.
Jeblast mencari perangkat asal token, kemudian grup perangkat tersebut. Token user
dengan `device_id` juga tetap menggunakan perangkat terpilih sebagai identitas asal.

## Pengaturan

Super admin membuka **Grup pengirim** (`/dashboard/sender-groups`), memilih pemilik,
nama grup/store, anggota, dan urutan cadangan. Semua anggota harus berasal dari
akun yang sama; satu perangkat hanya boleh masuk satu grup. Token tidak ditampilkan
atau diubah oleh pengaturan ini. Perangkat asal token selalu diutamakan; urutan
anggota mengatur prioritas cadangan. Grup nonaktif/tanpa grup memakai perilaku lama.

Pengaturan berlaku pada antrean API yang belum dikirim, termasuk antrean yang sudah
ada. Campaign, auto reply, percakapan dan endpoint lama yang mengirim langsung tidak
memakai routing grup. `/api/send-message`, alias v2/public, dan endpoint payload
antrean (`send-media`, `send-poll`, dll.) mendukung grup. Antrean harus aktif
(`DISPATCH_QUEUE_ENABLED=true`). Tidak ada jaminan pengiriman jika semua anggota
tidak tersedia; batas usia antrean global tetap berlaku.

## Identitas dan webhook

- `wa_dispatches.phoneId` tetap perangkat asal token sepanjang umur pengiriman.
- ID pengiriman, job ID, dedupe key, store, transaksi dan penerima tidak diganti.
- `senderPhoneId` dan `senderGroupId` mencatat pengirim aktual dan grup yang dipakai.
- `wa_dispatch_attempts` menyimpan riwayat setiap claim: pengirim, message ID,
  waktu dan hasil. Guard sebelum transport tercatat sebagai `SKIPPED`.
- Cek status menggunakan token asal, termasuk setelah kiriman dikirim cadangan.
  Token cadangan tidak mendapat akses ke kiriman milik token asal.
- Webhook global tetap memakai konfigurasi URL, autentikasi dan outbox yang sama.
  `dispatch.id` dan `dispatch.device_id` mempertahankan identitas asal. Field
  tambahan `dispatch.sender_device_id` dan `dispatch.sender_group_id` menyatakan
  pengirim aktual. Field yang sama tersedia di respons status API.
- Pada saat `QUEUED` sebelum pengirim dipilih, `sender_device_id` menggunakan
  perangkat asal sebagai nilai kompatibel; pengirim aktual tercatat saat claim
  `PROCESSING`. Ini tidak berarti pesan sudah dikirim.

## Pemilihan dan keselamatan pengiriman

Worker memilih socket yang terhubung dan perangkat aktif, tidak dalam maintenance,
tidak paused, lolos penilaian kesehatan adaptif, memenuhi warmup/kuota harian,
interval dan lease. Boundary transport tetap memeriksa dan mereservasi kuota
secara atomik. Cadangan mengonsumsi kuotanya sendiri.

Worker mengunci identitas asal dan pengirim aktual dengan lease serta heartbeat.
Grup/membership divalidasi lagi saat claim. Jika seluruh anggota tidak siap,
pesan tetap `QUEUED` dengan `SENDER_GROUP_UNAVAILABLE`, tanpa menambah attempts;
worker memeriksa lagi sekitar 30 detik (ditambah jeda polling).
Job yang sedang menunggu pengirim sebelumnya tidak menahan job lain dalam grup:
pesan baru yang belum dicoba tetap dapat diproses oleh nomor cadangan yang sehat.

ACK yang hilang, timeout, hasil tidak pasti atau message ID yang sudah digunakan
tetap melekat ke pengirim sebelumnya. Retry yang sudah ada menggunakan message ID
yang sama dan tidak pindah nomor. Receipt dicocokkan ke pengirim aktual dan message
ID, lalu memperbarui ID pengiriman asal. Pesan `FAILED`/`UNCERTAIN` tidak otomatis
dihidupkan kembali hanya karena grup dibuat.

Khusus ACK penolakan eksplisit 463 pada anggota grup: nomor tersebut dijeda;
percobaan dicatat gagal, message ID yang ditolak dihentikan, dan pengiriman yang
sama kembali ke antrean untuk anggota sehat lain. Tanpa grup, perilaku 463 lama
tetap berlaku. Pembatasan dan kuota setiap perangkat tetap berlaku.

## Pemasangan

1. Hentikan worker/proses pengiriman selama pembaruan agar versi lama dan baru
   tidak menulis bersamaan.
2. Untuk produksi gunakan CI/CD: `cd-feature-schema.cjs` menerapkan hanya tambahan
   fitur yang disetujui setelah backup, tanpa menjalankan migrasi lama atau menulis
   ulang riwayatnya. `prisma migrate deploy` tetap digunakan pada database lokal/CI baru.
3. Jalankan `npx prisma generate`, `npm run build`, lalu mulai ulang aplikasi/worker.
4. Buat grup secara eksplisit dari dashboard. Tidak ada perangkat produksi yang
   dimasukkan grup secara otomatis.

Untuk pembatasan waktu pengiriman, terapkan juga migrasi
`20261020040000_operating_hours` dan ikuti [panduan jam operasional](operating-hours.md).

Migrasi bersifat penambahan; data lama memakai `senderPhoneId=NULL`, yang berarti
pengirim adalah perangkat asal. Jangan menghapus perangkat/token asal karena
identitas tersebut tetap dipakai kasir untuk akses status dan deduplikasi.

## Verifikasi

- `node deployment/verify-dispatch-ack-retry.cjs`: regresi ACK/retry dengan clock
  sintetis dan transport tiruan.
- `node deployment/verify-sender-groups.cjs`: integrasi MySQL nyata dengan transport
  WhatsApp tiruan. Set `SENDER_GROUP_TEST_DATABASE_URL` ke database **baru** di
  localhost dengan nama `jeblast_sender_groups_test_<suffix>`. Tes menolak database
  yang sudah ada dan tidak membaca `DATABASE_URL` aplikasi. Tes membentuk skema
  sebelumnya dari revisi Git `f46d93a7e0e71e9f58f246f76f997455080fce39`
  kemudian menjalankan SQL migrasi baru. Tidak melakukan
  pengiriman WhatsApp atau HTTP webhook nyata; yang diperiksa adalah outbox-nya.
