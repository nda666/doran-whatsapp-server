# PM2 optimization — 12 October 2026

Applied to the production `doran-whatsapp` process after user approval.

Configuration:
- Memory restart threshold: `6144M` (6 GiB RSS).
- V8 old-space heap limit remains `4096` MiB.
- Exponential restart backoff: initial 1000 ms.
- Log timestamp: `YYYY-MM-DD HH:mm:ss Z`.
- Explicit autorestart enabled, watch disabled.
- One fork instance, 65-second PM2 kill timeout, dispatch concurrency 4, and current WhatsApp/queue flags retained.

Shutdown now handles SIGINT/SIGTERM through one shared promise. New HTTP work and new WhatsApp sessions are blocked during shutdown, reconnect timers stop, durable workers drain concurrently, pending socket creation and auth saves are awaited, sockets and HTTP/Next.js/database resources close, and a 60-second application deadline precedes PM2's 65-second kill timeout. Socket closure does not log out devices or remove their auth files.

Validation:
- Linux production Next.js build and server TypeScript compile passed in an isolated staging directory.
- Offline tests passed for drain/close ordering, repeated signals, cleanup after a stage failure, deadline expiry, auth save ordering, and reconnect/session creation guards.
- Applied configuration and saved PM2 dump verified. PM2 omits the default instances field from its saved dump; live configuration and process count verify one instance.
- Controlled live restart logged clean SIGINT shutdown in 363 ms, with no stage failure or deadline expiry.
- Local and public login HTTP 200; authenticated public Socket.IO WebSocket connected.
- Worker polling, claims and server acknowledgements resumed; 15 sockets connected, matching the pre-deploy snapshot. All 69 registered devices remain.
- Telegram and PM2 logrotate PIDs unchanged.
- Post-restart snapshot: 430 MiB RSS, CPU 3.6% at sampling; unstable restarts 0. These snapshots do not establish a performance improvement.

Existing queue condition: before and after deployment, dispatch health returned 503 for `BACKLOG_AGE_EXCEEDED` and `SENDER_OFFLINE_WITH_BACKLOG`. The worker is running and polling; approximately 5,800 unexpired queued jobs remain. This pre-existing operational backlog was not modified by this PM2 change.

Build ID: `vnNWY0Lxk6I9alu_ijD10`.
Rollback backup: `/home/jeblast/backups/doran-pm2-optimization-1791803149`.
Backup includes changed source/configuration, previous `.next`/`dist`, and the previous saved PM2 dump.
Deployment script: `deployment/deploy-pm2-optimization-20261012.py`.
Tests: `deployment/verify-pm2-optimization.cjs` and `deployment/verify-pm2-optimization-live.cjs`.

No database migration, dependency change, daemon upgrade, systemd migration, reboot, forced crash, memory stress test, or synthetic customer message was performed. Configuration synchronization used `pm2 save`; existing reboot cron remains in place.
