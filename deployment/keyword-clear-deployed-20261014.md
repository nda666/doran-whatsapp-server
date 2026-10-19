# Clear all auto-reply keyword tags

Deployed 14 October 2026. Added “Hapus semua tag” above the tags, aligned right. It clears both existing tags and pending input, uses a non-submit button, and is disabled when empty or when the form is disabled. Existing pipe-separated storage remains unchanged.

Validation: behavior checks including clear-all and add-after-clear passed; source TypeScript and component ESLint passed; isolated production build and authenticated HTTPS bundle check passed. Live browser confirmed multiple tags plus pending text cleared together, disabled empty state, and adding a new tag afterward. All test drafts cancelled without saving rules.

Build: `PU2RchND12QRnV5l4FsvP`.
Backup: `/home/jeblast/backups/doran-keyword-clear-1791951772`.
Log: `/home/jeblast/keyword-clear-deploy-20261014.log`.
Screenshot: `output/keyword-clear-live-20261014.jpg`.

Source baseline checked; source/runtime backed up; automatic rollback available. PM2 online, WhatsApp/dispatch flags preserved, Telegram PID unchanged.
