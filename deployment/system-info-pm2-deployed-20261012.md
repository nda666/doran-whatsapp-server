# PM2 details in Informasi Sistem — 12 October 2026

Deployed to https://dashboard.jeblast.com/dashboard/admin?tab=system-info.

The super-admin-only page now includes a PM2 card showing the active application process, PM2 version, ID/PID, status, mode/instances, start time in WIB, RSS/CPU snapshot, restart/unstable-restart counters, memory and heap limits, initial restart backoff, shutdown timeout, autorestart/watch, log timestamp, and comparison of selected active settings with the saved PM2 dump. Collapsible sections explain shutdown/log/startup and the configuration/restore-guide/archive/backup locations.

The API runs a fixed read-only PM2 jlist command with a five-second timeout, 4 MiB output cap, and ten-second successful snapshot cache. Only the current doran-whatsapp process is selected. Only allowlisted fields are returned; environment secrets, other applications, raw dump contents, and error details are never exposed. Missing PM2 data degrades to an unavailable status.

Validation: Linux production Next.js build and server TypeScript compilation passed. Unit verification covered allowlist redaction, metric conversion, and matching/mismatched/missing saved configuration. Live verification checked actual PID/settings, no-store response, absence of unapproved fields, 401 without authentication, and 403 for normal users. Chrome accessibility inspection confirmed loaded PM2 values and the expanded restore panel. Browser screenshot capture timed out, so no screenshot artifact was saved for this update.

Build ID: fZ-kahVOtwzUJt5WL3xdE.
Backup: /home/jeblast/backups/doran-system-info-pm2-1791805318.
Deployment: deployment/deploy-system-info-pm2-20261012.py.
Checks: deployment/verify-system-info-pm2.cjs and deployment/verify-system-info-pm2-live.cjs.

The existing PM2 optimization settings remain unchanged. Deployment restarted only doran-whatsapp and confirmed the Telegram process PID was unchanged. No database migration or synthetic customer message was performed.
