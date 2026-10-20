# Kolom dan filter grup pengirim

Status: implementasi siap masuk Git dan CI/CD atas permintaan pengguna. Deployment memakai workflow CI/CD utama setelah seluruh pemeriksaan lolos.

Halaman `/dashboard/phone` menampilkan kolom Grup pengirim setelah Label. Perangkat tanpa grup menampilkan Tanpa grup; grup nonaktif tetap terlihat dengan keterangan Tidak aktif. Kolom mendukung pengurutan berdasarkan nama grup.

Filter menyediakan Semua grup, Tanpa grup, dan pilihan grup tertentu. Filter berlaku bersama nama/nomor/koneksi/status, memakai pagination dan total dari server, serta tersimpan dalam URL. Pilihan grup dibatasi dengan ownerScope yang sama dengan daftar perangkat; super admin dapat melihat seluruh grup. Tidak ada perubahan keanggotaan grup, token, atau skema database.

Validasi lokal: TypeScript frontend dan server, tes `verify-phone-sender-group.cjs`, tes `verify-phone-search-return.cjs`, dan lint file terkait. Lint memiliki peringatan useEffect yang sudah ada pada halaman perangkat.

Paket `phone-sender-group-20261020.zip` hanya berisi lima file sumber terkait dan tes fitur. Baseline kelima sumber produksi telah cocok dengan HEAD lokal saat paket dibuat. Deploy menolak baseline berubah, membangun secara terisolasi, menjalankan tes dan build produksi sebelum promosi, mencadangkan sumber/runtime, serta mendukung rollback otomatis jika startup gagal. Build produksi belum dijalankan karena deploy tertahan sebelum akses tulis ke server.

Skrip dan paket deployment manual di atas disimpan sebagai catatan persiapan sebelumnya. Untuk perubahan ini, gunakan workflow CI/CD utama; jangan menjalankan deployment manual tambahan. Tes grup pengirim dan pemulihan pencarian juga terdaftar dalam suite regresi CI.
