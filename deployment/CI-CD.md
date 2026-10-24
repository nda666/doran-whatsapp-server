# CI/CD dashboard.jeblast.com

Workflow: `.github/workflows/ci.yml`. Target server lama: user `jeblast`,
`/home/jeblast/repos/doran-whatsapp-server`, PM2 `doran-whatsapp`.

## Setiap PR dan push main

1. Node 24.21.0, instalasi reproducible `npm ci`, validasi/generate Prisma.
2. Lint, replay seluruh migration pada MySQL 8 sementara, migration status,
   dan perbandingan schema hasil migration dengan `schema.prisma`.
3. Build Next.js + server TypeScript, suite regresi offline yang dipilih eksplisit.
4. Baca seluruh tabel database CI dan tes create/read/update/delete user sintetis.
   Buat dump memakai helper backup yang sama dengan produksi, restore ke database
   CI kedua, lalu bandingkan checksum isi seluruh tabel serta record user fixture.
5. Paket source commit yang sama dan checksum SHA-256.

CI tidak menggunakan database, secret, sesi WhatsApp, atau email produksi.
Tes `verify-*-live` sengaja tidak dijalankan. Lint warning dilaporkan; error memblokir.
Schema drift atau migration history yang tidak bisa direplay pada database CI
memblokir checks. Database produksi diperlakukan sebagai acuan terbaru dan
tidak menjalankan ulang riwayat migrasi saat deploy. Pengecualian tambahan struktur
untuk grup pengirim dan jam operasional disetujui pengguna pada 20 Oktober 2026,
dibatasi secara eksplisit oleh `cd-feature-schema.cjs` seperti dijelaskan di bawah.

## Konfigurasi GitHub sekali

Buat Environment `production` di repository Settings > Environments bila memiliki
izin admin; batasi deployment environment ke branch `main`. Workflow juga akan
mereferensikan environment ini saat deploy pertama. Tambahkan secrets berikut
di Settings > Secrets and variables > Actions (repository secrets), atau di
environment `production` bila konfigurasi environment tersedia:

| Secret | Isi |
| --- | --- |
| `DEPLOY_HOST` | `103.196.146.186` (verifikasi IP server sebelum aktivasi) |
| `DEPLOY_USER` | `jeblast` |
| `DEPLOY_PORT` | port SSH, default `22` |
| `DEPLOY_SSH_KEY` | private key SSH khusus deploy, public key terpasang di server |
| `DEPLOY_KNOWN_HOSTS` | entri host key server yang fingerprint-nya sudah diverifikasi |

Jangan memasukkan secret ke source, chat, atau log. Jangan menonaktifkan
`StrictHostKeyChecking`. Gunakan key khusus CI/CD, bukan key pribadi harian.
User deploy perlu akses hanya aplikasi/backup miliknya, Node, npm, Python 3,
PM2, `mysqldump`, serta database dari `.env` server. Akses ini tetap dapat
menjalankan kode produksi; lindungi akses tulis branch main.

Set repository Actions variable `PRODUCTION_DEPLOY_ENABLED=true` setelah
semua checks lulus dan akses SSH siap. Selama variable belum diaktifkan,
CI berjalan tetapi job deploy dilewati. Workflow tidak membutuhkan token GitHub
atau clone privat di VPS karena source dikirim dari artifact hasil CI.

Set branch rule untuk `main`: wajibkan PR dan status check
`Code, tests, build and database` bila ingin mencegah push langsung yang belum dites.
Branch rule tidak dibuat otomatis oleh source workflow.

## Proses deploy

### Optimasi waktu build (24 Oktober 2026)

- GitHub tetap mengambil riwayat Git lengkap untuk tes skema historis,
  dan menyimpan cache compiler Next.js
  (`.next/cache/webpack` dan `swc`) antar-run dengan key OS/arsitektur,
  Node, dependency, konfigurasi build, dan commit. Restore hanya memakai prefix
  konfigurasi yang cocok. Cache npm yang sudah ada tetap digunakan;
  `npm ci --prefer-offline --no-audit --no-fund` mengurangi akses registry tambahan.
- VPS menyalin cache compiler dari runtime aktif ke staging sebelum build jika
  package/lockfile, Node, konfigurasi build, dan seluruh file environment cocok.
  File cache disalin terpisah agar build tidak menulis ke runtime aktif.
  Cache data/fetch, halaman hasil build dan BUILD_ID tidak digunakan ulang.
  Cache tidak tersedia atau gagal disalin berarti build berjalan tanpa cache.
  Path staging tetap `.doran-cd-build` karena key internal webpack menyertakan
  path absolut instalasi Next.js. Lock deploy tetap berlaku; direktori staging
  yang tertinggal untuk pemulihan membuat deploy baru berhenti, bukan ditimpa.
- Build dan suite tes tetap dijalankan pada GitHub serta VPS. Artifact GitHub
  tetap berupa source; build VPS tetap memakai environment produksi.
- Snapshot integritas sesi memakai metadata `os.scandir` langsung untuk mengurangi
  operasi stat dan objek Path per file. Isi **seluruh** file tetap di-hash dua kali;
  backup lengkap dan pemeriksaan jumlah record tetap dijalankan.
- Log `COMPILER_CACHE` dan `DEPLOY_STEP_STARTED`/`DEPLOY_STEP_FINISHED`
  menampilkan status cache serta durasi/exit code per perintah tanpa output sensitif.
  Efek cache terlihat setelah cache terisi; waktu produksi perlu dibandingkan
  lewat run CI/CD berikutnya, bukan diasumsikan dari pengujian lokal.

### Langkah deploy

- Antar-deploy diserialkan GitHub concurrency dan lock Linux di VPS.
- Source diekstrak ke staging terisolasi; link/path traversal/runtime data ditolak.
- Dependency, Prisma client, build dan tes dijalankan ulang di VPS.
- Database produksi hanya dibaca dan dicatat. Tidak ada `migrate deploy`,
  `migrate resolve`, reset, `db push`, seed, atau penulisan riwayat migration.
  Guard command menolak perintah Prisma yang dapat mengubah database.
- Pengecualian yang disetujui hanya `20261020030000_sender_groups` dan
  `20261020040000_operating_hours`: helper memverifikasi SHA-256 SQL, memeriksa
  seluruh diff agar tidak ada perubahan lain, lalu menambahkan tabel/kolom/index/
  foreign key yang belum ada setelah aplikasi berhenti dan kedua backup selesai.
  Tidak ada DML, penghapusan, pengubahan kolom lama, replay migrasi lama, atau
  penulisan `_prisma_migrations`. Eksekusi idempotent dan hasil setiap tambahan
  dicatat di backup privat `feature-schema-result.json`. Diff akhir harus nol.
- Simpan nama/checksum migration yang sudah diterapkan, perbedaan checksum,
  migration yang belum tercatat, dan migration belum selesai dalam
  `migration-inventory.json`. Perbedaan riwayat bersifat catatan; tidak dieksekusi
  atau ditandai applied secara otomatis. Termasuk migration penyelarasan legacy
  dalam source: hanya untuk replay database CI/install baru.
- `prisma migrate diff` hanya membandingkan schema secara read-only. Schema
  aktual harus sesuai kebutuhan kode atau hanya berbeda pada tambahan yang
  diizinkan helper sebelum aplikasi dihentikan. Perbedaan lain memblokir deploy.
- Stop hanya `doran-whatsapp` setelah build lulus. Ada jeda layanan selama
  backup dan promosi; durasinya tergantung ukuran database/storage.
- Backup database penuh (`mysqldump --single-transaction`), env dan storage
  ke direktori privat `/home/jeblast/backups/doran-cd-*`.
- Simpan hitungan record seluruh tabel sebelum/sesudah persiapan deploy.
  Seluruh tabel lama, jumlah record, dan isi catatan `_prisma_migrations` wajib
  tetap sama sebelum aplikasi dijalankan kembali. Hanya tabel baru `sender_groups`
  dan `wa_dispatch_attempts` yang boleh ditambahkan dengan nol record. Perubahan
  lain memblokir promosi.
- Periksa hash env dan seluruh file auth WhatsApp sebelum restart.
- Tukar source, dependencies, Prisma client, serta runtime sebagai satu promosi
  yang dapat dipulihkan. `.env*`, `storage`, dan `.git` tetap di lokasi asli.
  Isi `public/uploads` dan `public/downloads` juga dipertahankan, dibackup,
  dan dipindahkan kembali ke path yang sama setelah swap static assets.
- Periksa login lokal, koneksi database, endpoint dispatch dengan autentikasi,
  HTTPS publik, dan PID proses PM2 lain. Simpan PM2 hanya setelah lulus.
  Restart mandiri `backendsms` boleh lewat hanya jika kembali online, PID positif
  berubah, penghitung restart meningkat, dan identitas serta konfigurasi proses
  tetap sama. Perubahan proses lain tetap memblokir deploy. Snapshot PM2 sebelum
  dan sesudah disimpan tanpa environment rahasia untuk audit.
  Sesuai persetujuan pengguna, peringatan `BACKLOG_AGE_EXCEEDED` dan
  `SENDER_OFFLINE_WITH_BACKLOG` boleh tetap ada (termasuk respons 503).
  Worker wajib aktif, polling dan sampling antrean harus sukses dalam 60 detik;
  error runtime, polling macet, dan `CLAIM_STALLED` tetap memblokir deploy.
- Bila promosi/health gagal, pulihkan runtime lama dan periksa login. Bila
  rollback gagal, staging dipertahankan untuk pemulihan operator.

Backup database tidak otomatis direstore: restore otomatis dapat menghapus pesan
baru. Deploy aplikasi mempertahankan schema, isi record, dan riwayat migration
produksi, kecuali tambahan struktur yang disebutkan di atas. Pengujian replay
seluruh migration dan restore hanya berjalan pada database CI sementara. Jika
runtime harus dirollback, tambahan nullable/defaulted tetap dipertahankan agar
data tidak dihapus; runtime lama tetap dapat memakai schema tersebut.

## Apa yang dibuktikan

Checks membuktikan build, regresi yang tercakup tes, kesesuaian schema, akses
tabel, serta hitungan record dan file auth saat deploy. Ini bukan pemeriksaan
kebenaran bisnis setiap isi record, bukan tes seluruh kemungkinan fitur,
dan bukan bukti setiap backup produksi telah diuji restore. Metode dump/restore
diuji pada seluruh tabel database CI. Tidak ada pengiriman
pesan WhatsApp sungguhan dalam CI. Uji restore berkala ke database terpisah
tetap diperlukan untuk memastikan backup dapat digunakan.

Detail SQL/count/log hanya berada di backup privat VPS, tidak menjadi artifact
GitHub. Backup CI/CD belum dipangkas otomatis; tentukan retensi setelah jumlah
dan ukuran backup diamati. File incoming di `/home/jeblast/.doran-incoming-*`
dapat dibersihkan operator setelah keberhasilan deploy tercatat.

## Menjalankan ulang dan diagnosis

GitHub > Actions > CI / CD > Run workflow (`main`) mengulang seluruh checks
sebelum deploy. Lihat job yang gagal; jangan melewati check agar bisa deploy.
Untuk log command yang disembunyikan demi kerahasiaan, baca `commands.log`
di backup VPS dengan akses SSH. `SUCCESS.json` hanya dibuat setelah health lulus.

Dokumentasi: https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments
dan https://www.prisma.io/docs/orm/v6/prisma-migrate/workflows/patching-and-hotfixing
