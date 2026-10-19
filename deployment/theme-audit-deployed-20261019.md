# Deploy UI dan tema Doran WA — 19 Oktober 2026 (WIB)

Live: https://dashboard.jeblast.com
Build: `K3UPPUihia3GVyxVULyG5`
Cadangan sumber/runtime: `/home/jeblast/backups/doran-theme-audit-1792342853`.

## Hasil verifikasi

- Build produksi terisolasi (Next.js dan TypeScript) lulus sebelum promosi.
- Hash sumber dan build diverifikasi; WhatsApp serta dispatch tetap enabled, proses Telegram tetap sama.
- Dua belas kombinasi enam tema dan mode terang/gelap lulus pemeriksaan browser HTTPS publik. Pemeriksaan menunggu transisi warna tombol selesai.
- Judul halaman, deskripsi, footer dan grafik dashboard terverifikasi di build publik.
- Grafik pengiriman tanggal 18 Oktober 2026 WIB menunjukkan 704 pesan, sesuai agregat database berdasarkan sentAt.
- Daftar antrean dibuka dan pencarian tanggal 18 diuji melalui form browser dengan sesi admin sementara. Hanya GET/pencarian; tidak mereset atau mengirim ulang pesan.

## Diagnosis angka nol pada daftar antrean

Tanggal pencarian: 18/10/2026 sampai 18/10/2026, semua status, semua perangkat.

| Sumber | Total data | Baris halaman pertama |
|---|---:|---:|
| Semua sumber | 5.430 | 5 |
| Web | 0 | 0 |
| API | 5.430 | 5 |

Seluruh data yang dibuat pada tanggal 18 berasal dari API. Filter Web mereproduksi hasil kosong; memilih API atau Semua sumber lalu Cari menampilkan data. Saat pemeriksaan awal terdapat 4.768 pesan tanggal 18 berstatus QUEUED. Angka antrean dapat berubah selama worker berjalan.

Pemeriksaan dilakukan dengan akun admin global. Akun biasa tetap dibatasi data miliknya. Filter yang semula dipilih pada tab pengguna belum dibaca, sehingga hasil uji filter Web ini menjelaskan kondisi nol yang berhasil direproduksi, bukan bukti bahwa pengguna sebelumnya memilih filter tersebut.

Hitungan 5.430 memakai createdAt, sedangkan 704 memakai sentAt; keduanya mengukur hal berbeda. Pengaturan batas usia data produksi adalah 3 hari. Localhost memakai wa_local yang kosong, bukan database produksi.

## File sumber yang dipromosikan

- `src/components/Layout.tsx`
- `src/components/DashboardCharts.tsx`
- `src/lib/chartScale.ts`
- `src/pages/dashboard/index.tsx`
- `src/styles/DashboardSummary.module.css`
- `src/styles/globals.css`
- `src/lib/dashboardColors.ts`
- `src/lib/dashboardTheme.ts`
- `src/pages/_app.tsx`
- `src/components/MessagingAnalytics.tsx`

## Artefak

- `deployment/theme-audit-live-diff-20261018.txt`
- `deployment/theme-audit-deploy-20261018.log`
- `deployment/verify-theme-audit-live-20261019.cjs`
- `output/theme-audit-public-verification-20261019.json`
- `output/public-delivery-18oct-20261019.png`
