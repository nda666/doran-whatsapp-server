# Dashboard shortcuts — deployed 14 October 2026

Live URL: https://dashboard.jeblast.com/dashboard

Production build: `zR7zEo6RMocJ90bz1qstJ`.
Rollback backup: `/home/jeblast/backups/doran-dashboard-shortcuts-1791940550`.

- Jumlah perangkat: **Lihat Detail Perangkat** → `/dashboard/phone`.
- Blast / Bulk menunggu: **Lihat Antrean Pengiriman** → `/dashboard/dispatch`.
- Both links use Next.js navigation, a right arrow, theme colors, hover feedback, visible keyboard focus, and reduced-motion support. Existing statistics/API/30-second refresh remain unchanged.

Validation:

- Local TypeScript and ESLint checks passed.
- Browser previews passed for admin/user, light/dark, and 390/768/1280px widths (12 combinations), including no horizontal overflow and keyboard focus.
- Isolated production Next.js and server TypeScript build passed before promotion.
- Authenticated public HTTPS verification passed for the designated admin and an ordinary user. Both destination pages and dashboard assets returned successfully.
- At verification, admin data contained 65 devices, 23 online and 7,460 waiting; device total matched the database and API/database dispatch totals both equaled 13,966. Ordinary-user scoped counts were zero. These are observed snapshots, not fixed display values.
- Actual production browser checks passed at 1440px and 390px in light and dark mode: both links were clicked and reached their intended pages; displayed device/waiting numbers matched the API; no page runtime errors or horizontal overflow.
- Only `doran-whatsapp` restarted. Its WhatsApp and durable-dispatch flags remain enabled; the Telegram process retained its PID. PM2 configuration was saved.

The initial promotion was automatically rolled back because the verifier searched server HTML for links while the cards were still skeletons. The verifier was corrected to inspect the served dashboard bundle and destination URLs; the second deployment and subsequent hydrated browser checks passed. The first rollback backup is `/home/jeblast/backups/doran-dashboard-shortcuts-1791940465`.

Deployment scripts: `prepare-dashboard-shortcuts-20261014.py`, `deploy-dashboard-shortcuts-20261014.py`, and `verify-dashboard-shortcuts-live.cjs`.
Live screenshots: `output/dashboard-shortcuts-live-{1440,390}-{light,dark}.png`.

To roll back, stop only `doran-whatsapp`, restore the changed files according to `source-before.json` (remove files that were previously absent), restore `.next` and `dist` from the backup runtime directory, and restart with the existing ecosystem configuration. No database migration or database rollback is needed.
