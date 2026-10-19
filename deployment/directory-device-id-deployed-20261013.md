Deployment berhasil: 2026-10-13.
Build: ZdJQtUU6pebv75natX8jO
Backup: /home/jeblast/backups/doran-directory-device-id-1791842829

Respons list-phones dan phone-detail kini menyertakan device_id pada setiap data[] dengan nilai yang sama seperti id; id tetap tersedia. Hak akses dan field privat tetap mengikuti aturan sebelumnya. Dokumentasi dashboard dan contoh Postman diperbarui.

Verifikasi: ESLint, TypeScript scoped, verify-registered-phones, verify-all-senders-auth, build produksi terisolasi, 16 request live read-only GET/POST untuk kedua endpoint/alias dan token user/device. PM2 online, WhatsApp/dispatch tetap aktif, PID telegram-sender tetap sama. Tidak ada pesan atau email dikirim.
