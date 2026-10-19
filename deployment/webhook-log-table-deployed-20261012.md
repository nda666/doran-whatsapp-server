# Layout tabel log webhook

Aktif 12 Oktober 2026 (Asia/Jakarta) di dashboard/admin, tab Log Pengiriman Webhook.
Build final: `jPpy6xY4sZiSNcc-JGDtv`.
Backup komponen/API: `/home/jeblast/backups/doran-webhook-log-table-1791741465`.
Backup perapian kolom: `/home/jeblast/backups/doran-webhook-log-width-1791741596`.

Tabel memakai DashboardTable dan useTableState yang sama dengan menu lain, class table-with-data-count, ukuran baris standar, pilihan Tampilkan 5/10/20/50/100 data per halaman, header sortable, Jumlah data serta pagination standar. Card pembungkus khusus tabel dihapus. Aksi menggunakan ActionDropdown dengan Lihat Detail. Kolom memiliki lebar terukur dan scroll horizontal agar UUID tetap terbaca pada satu baris. Form pencarian memiliki nama unik agar label tidak bertabrakan dengan tab admin lainnya.

API menerima sort/order dengan enum kolom dan arah tetap sebelum SQL ORDER BY; sorting dilakukan terhadap seluruh hasil, bukan hanya halaman yang terlihat. Tie-breaker waktu/jenis/id tetap deterministik.

TypeScript, ESLint, regresi log webhook (termasuk penolakan sort/order invalid), build produksi Linux, dan verifikasi API HTTPS/pengurutan waktu dua arah/bundle lulus. Browser memverifikasi 5 baris per halaman, header urutan, jumlah data, dropdown Aksi dan detail. Screenshot: output/webhook-log-table-layout.png. Verifikasi tidak mengirim webhook atau pesan WhatsApp. Direktori build sementara kedua deployment dibersihkan; rollback source/runtime disimpan.
