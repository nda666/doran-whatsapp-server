# Tema biru awal dipulihkan — 17 Oktober 2026

Live: https://dashboard.jeblast.com.
Build: `HN6ntVrk3VfDG3XxsYOHN`.
Backup: `/home/jeblast/backups/doran-original-blue-1792213902`.

Original palette recovered from `tmp/dashboard-redesign-live-before/src/lib/dashboardTheme.ts`: primary #0875bd, layout #f2f9ff, table headers #edf7ff, selected menu #d9efff, border #c9deee, text #193b56. Blue is again the default. New browser preference key `doran-color-v2` resets the earlier experimental theme once and persists subsequent choices. The other five fresh palettes remain available.

Only four source files promoted: dashboardColors, DashboardPreferences, dashboardTheme, globals.css. Concurrent local edits in _app and Layout were excluded after reviewing the live diff. Targeted lint passed. The full local type check encountered syntax errors in unrelated concurrently edited files; isolated production build from live source plus the four theme files passed.

Live checks confirm default blue even with the earlier green preference, original layout background, all six choices in both light and dark modes, primary button text contrast >= 4.5:1 after color transitions finish, persistence across reload, mobile picker and navigation. Screenshot `output/original-blue-workspace-20261017.png` visually inspected. Recoverable hydration warnings observed on earlier deployments remain.

PM2 app online; WhatsApp and dispatch enabled, Telegram PID unchanged. Source manifest verified, staging cleaned, previous runtime retained under normal backup policy.
