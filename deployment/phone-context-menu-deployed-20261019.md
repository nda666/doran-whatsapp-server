# Klik kanan tabel Phone — deployed 19 Oktober 2026

URL: https://dashboard.jeblast.com/dashboard/phone?is_online=0&limit=20

Menghapus handler onRow/onContextMenu kosong yang memanggil preventDefault pada tabel Phone, sehingga menu bawaan browser tersedia kembali. Paket dibuat dari baseline live dan hanya mengubah src/pages/dashboard/phone.tsx.

Build aktif: `MmPlOv32AXcxUFDJX5kZp`.
Backup sumber/runtime: `/home/jeblast/backups/doran-phone-context-menu-1792384264`.

Validasi:
- Lint lokal lulus; ada peringatan React Hook yang sudah ada sebelumnya.
- Build produksi Next.js dan TypeScript terisolasi lulus.
- Startup dan proses aplikasi online; WhatsApp dan dispatch queue enabled; PID Telegram dipertahankan.
- Verifikasi browser terautentikasi pada URL pengguna lulus: klik kanan sel baris tabel memicu contextmenu dengan prevented=false dan inRow=true.
- Halaman publik merespons HTTP 200.
- Backup lama dipertahankan dan direktori staging dibersihkan.

Log deploy: deployment/phone-context-menu-deploy-20261019.log.
Verifier: deployment/verify-phone-context-menu-live-20261019.cjs.
