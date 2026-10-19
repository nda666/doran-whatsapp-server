# Token API khusus admin utama

Deployed: https://dashboard.jeblast.com
Build: DdfEC9tbn8ULBzEVi3W9i
Backup: /home/jeblast/backups/doran-admin-api-token-20261010

GET/POST /api/public/list-phones dan /api/public/phone-detail menyertakan data[].token untuk admin utama yang disetujui. Pengguna lain tidak mendapat token; QR tetap dikecualikan.

Uji lokal pembatasan akses, TypeScript, paket Postman, staging production build, dan pemeriksaan live read-only lulus. HTTPS eksternal dengan token yang diberikan pengguna membuktikan list-phones memiliki 68 device dan seluruh device memiliki token. phone-detail juga lulus pada GET/POST. Tidak ada pesan uji dikirim.

Percobaan pertama rollback karena assertion HTML lama mengharapkan isi panel dokumentasi yang tertutup. Pemeriksaan disesuaikan agar memeriksa judul panel HTML serta endpoint/access/token di JS halaman. Deployment kedua lulus. Proses telegram-sender tetap sama.
