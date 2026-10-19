# Phone columns — 12 October 2026

Deployed build `71f4z9ZE0MFYpo1kl_YYq` to `/dashboard/phone` after explicit user approval.
Backup: `/home/jeblast/backups/doran-phone-column-layout-1791768402`.

Label now uses the same nowrap rendering as Nama Akun WA, allowing its width to follow the full text. Columns are ordered Nomor, Nama Akun WA, Label, Status, Status Perangkat, Save Group, then the existing ownership (admin only), API token, created date, and action columns.

Validation: local ESLint passed with two existing hook dependency warnings; TSX syntax passed; isolated production Next.js/server build passed; authenticated live HTML header order and JavaScript assets passed. Browser verification confirmed five populated rows with Label on one line, including Doran - JETE Nota 10. Screenshot: `output/phone-column-layout-live.png`.

Deployment retained Telegram PID and enabled WhatsApp/dispatch states. No device settings, tokens, or messages were changed during verification.
