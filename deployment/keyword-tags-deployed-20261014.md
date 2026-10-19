# Auto-reply keyword tags — 14 October 2026

Deployed to dashboard.jeblast.com. Keywords are entered as removable tags using Enter, with the help text “Tekan Enter untuk menambahkan kata kunci”. Enter is prevented from submitting/bubbling, including blank input and IME composition. Commas remain part of a keyword, surrounding whitespace is trimmed, and new duplicates are ignored case-insensitively. Pending input is committed on blur before clicking Save. The existing pipe-separated API/storage format and keyword matcher are preserved.

Validation: source TypeScript passed; ESLint reported no errors (two existing form hook warnings). Behavior checks cover existing rules, Enter suppression, empty input, deduplication, commas, IME, pending input, and removal. Isolated Linux production build and authenticated HTTPS page/bundle verification passed. Live Chrome verified tags added by Enter, blank Enter without submit, comma-containing tag, removal, and fresh draft reset. Test drafts were cancelled; no auto-reply rule was saved and no WhatsApp message was sent.

Build ID: `9nm6TtaJUkzBa5FJvsJYG`.
Backup: `/home/jeblast/backups/doran-keyword-tags-1791951363`.
Deployment log: `/home/jeblast/keyword-tags-deploy-20261014.log`.
Screenshot: `output/keyword-tags-live-20261014.jpg`.

Deployment checked source baseline/digests, backed up source/runtime, and supports automatic rollback. PM2 online, WhatsApp/dispatch production flags preserved, and Telegram PID unchanged. No database migration or dependency change.
