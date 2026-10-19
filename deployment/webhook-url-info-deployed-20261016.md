# Webhook URL information

Deployed 16 October 2026 (Asia/Jakarta).

Added an accessible information icon beside Webhook URL in the shared add/edit device form. Hover, focus, or click displays: "Meneruskan data pesan WhatsApp yang masuk ke aplikasi atau sistem lain melalui URL ini. Tetap berjalan meski Balasan Otomatis nonaktif. Balasan ke customer perlu diatur di sistem penerima. Kosongkan jika tidak digunakan."

Only the shared phone form changed. Live baseline reviewed. Isolated production build and existing regressions passed. After deployment the browser asset containing the tooltip and the sign-in page returned HTTP 200. WhatsApp and Telegram processes online; Telegram PID unchanged. Auto-reply typing regression passed again. Backup success and staging removal verified.

Build: `4bfh0Xh7-DrPrpKnoFZpL`.
Backup: `/home/jeblast/backups/doran-webhook-url-info-1792107374`.
Log: `/home/jeblast/webhook-url-info-deploy-20261016.log`.
