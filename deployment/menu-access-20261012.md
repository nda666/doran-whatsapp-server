# Hak akses menu

Super admin mengikuti aturan akun yang sudah ada: email `admin@gmail.com`, role `ADMIN`, dan status `APPROVED`. Akun ADMIN dengan email lain memiliki akses operasional yang sama dengan user dan hanya dapat mengakses data miliknya.

| Menu / fitur | User disetujui | Super admin |
| --- | --- | --- |
| Dashboard, laporan, log, pencarian | Data sendiri | Semua pemilik |
| Campaign / Blast, antrean pengiriman | Data sendiri | Semua pemilik |
| Kontak, grup kontak, File Manager | Data sendiri | Semua pemilik |
| Perangkat, QR, token perangkat, pengaturan perangkat, auto reply | Perangkat sendiri | Semua pemilik |
| API Docs | Ya | Ya |
| Master Paket (tambah, edit, hapus, limit device) | Tidak | Ya |
| Admin Panel: pengguna, role, password, persetujuan, paket akun, limit, masa berlaku | Tidak | Ya |
| Pengaturan server, port/URL, SSL, status update/migration | Tidak | Ya |
| Webhook global perangkat/pengiriman, kunci, log webhook | Tidak | Ya |
| Kirim webhook status manual ke kasir | Tidak | Ya |
| Konsol antrean teknis `/queues` dan `/api/bull-queue` | Tidak | Ya |

Pengaturan perangkat sendiri tetap tersedia untuk operasional akun. Pengaturan webhook global dan tindakan yang memengaruhi integrasi kasir dibatasi ke super admin.

Menu admin disembunyikan melalui aturan super admin yang sama. Halaman Admin Panel dan Master Paket mengecek akun terkini di database pada setiap request dan mengarahkan akun lain ke dashboard; Layout juga mencegah komponen admin dirender saat sesi masih dimuat atau tidak memenuhi syarat. Semua API di `/api/admin` menggunakan middleware super admin setelah autentikasi dan pemeriksaan persetujuan akun, sehingga request langsung atau bearer token juga ditolak dengan 403. Konsol antrean menggunakan penjagaan yang sama, termasuk pemeriksaan origin untuk perubahan melalui cookie.

Verifikasi tanpa akses database atau pengiriman pesan:

```powershell
node deployment/verify-super-admin-access.cjs
node deployment/verify-phone-ownership.cjs
npx tsc --project tmp/tsconfig.dashboard-check.json --noEmit
```

Sudah diterapkan ke produksi pada 12 Oktober 2026. Build `hYGUtLIXt-pYohhexZtPW`; pemeriksaan melalui localhost dan https://dashboard.jeblast.com lolos. Lihat `super-admin-access-deployed-20261012.md` untuk catatan deployment.
