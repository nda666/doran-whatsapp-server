# Menu Aksi, modal ringkas, dan Authorization

Aktif 12 Oktober 2026 (Asia/Jakarta) di https://dashboard.jeblast.com/dashboard/dispatch.
Build final: `FsshhDyXh4KUqzvrYVzl6`.
Backup fitur: `/home/jeblast/backups/doran-dispatch-action-menu-1791738116`.
Backup perapian kolom ringkasan: `/home/jeblast/backups/doran-dispatch-webhook-summary-1791738243`.

Kolom Aksi memakai ActionDropdown yang sama dengan tabel perangkat, dengan Lihat pesan dan Kirim webhook (admin utama). Lebar kolom 130. Modal kirim berada 24 px dari atas, dengan teks lebih singkat, jarak vertikal kecil, ringkasan dua kolom dan endpoint satu baris penuh. Isi modal dibatasi tinggi viewport agar footer tetap terjangkau pada layar kecil.

Sesuai permintaan pengguna, header Authorization pada detail preview dan hasil pengiriman menampilkan Bearer beserta kunci asli dan ikut tersalin melalui Salin lengkap. Akses API tetap isSuperAdmin dan respons Cache-Control=no-store. Secret hanya dibaca dari konfigurasi kasir yang cocok dengan endpoint; tidak ditanam di bundle/source. Payload/response capture dan transport tidak berubah. Respons endpoint masih menyamarkan salinan secret bila dikembalikan oleh kasir.

TypeScript dan mock tujuh status, preview tanpa event/network, auth header sesuai konfigurasi, akses admin, error/no-retry lulus. Build Linux dan regresi webhook status/perangkat serta pemeriksaan API/bundle produksi lulus. Live preview Authorization dibandingkan dengan kunci kasir tersimpan tanpa menyimpan kunci dalam dokumentasi. Browser memverifikasi satu tombol dengan dua opsi, header aktual tersedia, serta modal kirim lengkap dan footer terlihat pada viewport pengguna. Screenshot tanpa kunci: output/dispatch-compact-actions.png. Tidak ada pengiriman WhatsApp atau webhook pelanggan dalam verifikasi ini. Filter transaksi 5553753 dipulihkan, modal kirim dibiarkan terbuka.
