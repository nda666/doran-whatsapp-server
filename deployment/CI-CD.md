# CI/CD dashboard.jeblast.com

Workflow: `.github/workflows/ci.yml`. Target server lama: user `jeblast`,
`/home/jeblast/repos/doran-whatsapp-server`, PM2 `doran-whatsapp`.

## Setiap PR dan push main

1. Node 24.21.0, instalasi reproducible `npm ci`, validasi/generate Prisma.
2. Lint, replay seluruh migration pada MySQL 8 sementara, migration status,
   dan perbandingan schema hasil migration dengan `schema.prisma`.
3. Build Next.js + server TypeScript, suite regresi offline yang dipilih eksplisit.
4. Baca seluruh tabel database CI dan tes create/read/update/delete user sintetis.
5. Paket source commit yang sama dan checksum SHA-256.

CI tidak menggunakan database, secret, sesi WhatsApp, atau email produksi.
Tes `verify-*-live` sengaja tidak dijalankan. Lint warning dilaporkan; error memblokir.
Schema drift atau migration history yang tidak bisa direplay memblokir deploy;
perbaiki dengan migration baru yang direview, bukan mengedit migration yang sudah diterapkan.

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

- Antar-deploy diserialkan GitHub concurrency dan lock Linux di VPS.
- Source diekstrak ke staging terisolasi; link/path traversal/runtime data ditolak.
- Dependency, Prisma client, build dan tes dijalankan ulang di VPS.
- Periksa checksum semua migration produksi; migration gagal/berubah memblokir.
- Hanya migration additive sederhana yang otomatis boleh berjalan. Migration
  penghapusan/perubahan tipe/data membutuhkan review dan penerapan terpisah.
  Pengecualian yang sudah direview dipin dengan checksum SQL: migration
  `20261019100000_align_legacy_inbox_and_phone_constraint` mempertahankan
  kolom legacy `retry`, membuat `sentAt` nullable seperti produksi, dan memakai
  metadata FK `NO ACTION` (pembatasan yang setara dengan `RESTRICT` di MySQL).
  Tidak ada isi record dihapus atau ditimpa. Default Text webhook di schema
  juga disesuaikan dengan migration/produksi yang memang tanpa default database.
- Stop hanya `doran-whatsapp` setelah build lulus. Ada jeda layanan selama
  backup, migration, dan promosi; durasinya tergantung ukuran database/storage.
- Backup database penuh (`mysqldump --single-transaction`), env dan storage
  ke direktori privat `/home/jeblast/backups/doran-cd-*`.
- Simpan hitungan record seluruh tabel sebelum/sesudah migration; perbedaan
  pada tabel lama (selain tabel riwayat migration) memblokir promosi.
- Periksa hash env dan seluruh file auth WhatsApp sebelum restart.
- Tukar source, dependencies, Prisma client, serta runtime sebagai satu promosi
  yang dapat dipulihkan. `.env*`, `storage`, dan `.git` tetap di lokasi asli.
  Isi `public/uploads` dan `public/downloads` juga dipertahankan, dibackup,
  dan dipindahkan kembali ke path yang sama setelah swap static assets.
- Periksa login lokal, koneksi database, endpoint dispatch dengan autentikasi,
  HTTPS publik, dan PID proses PM2 lain. Simpan PM2 hanya setelah lulus.
- Bila promosi/health gagal, pulihkan runtime lama dan periksa login. Bila
  rollback gagal, staging dipertahankan untuk pemulihan operator.

Backup database tidak otomatis direstore: restore otomatis dapat menghapus pesan
baru. DDL MySQL tidak bersifat transaksional; migration gagal perlu pemeriksaan
operator dan `prisma migrate resolve` sesuai hasil pemeriksaan. Jangan gunakan
`migrate reset`, `db push`, atau seed di produksi.

## Apa yang dibuktikan

Checks membuktikan build, regresi yang tercakup tes, kesesuaian schema, akses
tabel, serta hitungan record dan file auth saat deploy. Ini bukan pemeriksaan
kebenaran bisnis setiap isi record, bukan tes seluruh kemungkinan fitur,
dan bukan bukti restore backup telah berhasil diuji. Tidak ada pengiriman
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
