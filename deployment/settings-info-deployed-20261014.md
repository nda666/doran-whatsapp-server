# Compact setting information

Deployed on 14 October 2026. Build: `ge6hKjuqz3JoqGVlh6kj8`.

- Removed the four large information banners above Global Settings.
- Added a small blue information icon next to each setting label. Its popover opens on hover, keyboard focus or click, with a descriptive accessible button label.
- Preserved descriptions for dispatch age, queue order and random delay. Added Postmark server-token help and general help for other setting rows.
- General Global Settings help is available from a small icon beside Tambah setting.
- Popover content wraps and limits its width to fit narrow screens. Existing error alerts and edit inputs remain available.
- Only `src/components/GlobalSettings.tsx` changed. Stored settings, worker behavior and database configuration were not changed.

Validation: application type checks passed locally; isolated VPS production build passed; existing live verification confirmed random-delay inputs, authenticated settings API, persisted 2–5 second range and active worker polling. Existing offline/backlog health alerts remain.

Backup: `/home/jeblast/backups/doran-settings-info-1791960574`. Deployment retained the previous runtime for rollback, restarted only the WA application and preserved other PM2 process PIDs.
