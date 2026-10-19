# Global random delay inputs

Deployed on 14 October 2026. Build: `V3zF6x12q7KB5UyFpsQLn`.

Admin > Pengaturan Global now includes Jeda acak pengiriman (detik). Editing this row shows Mulai (detik) and Hingga (detik), initialized to 2 and 5. The table displays the range in seconds rather than its storage representation.

- Both values are saved atomically in the encrypted `dispatch-random-delay` setting. Bounds are integers from 1 to 30 seconds; maximum must be at least minimum. Equal bounds are supported for a fixed delay.
- The same range controls polling and ordinary sender cooldowns. Each caller draws independently. The worker rereads the setting at each poll and each online sender selection; changing it requires no restart. Timers already scheduled and work already selected finish with the range they previously read.
- First poll initialization reads the current persisted range. Shutdown awaits initialization and prevents newly scheduled timers after stopping. Failed polls still reschedule.
- Campaigns can retain a longer delay, and offline/inactive devices retain the 30-second cooldown.
- Global setting values are authoritative; the previous environment min/max values no longer configure these timers. Missing setting defaults to 2–5 seconds. API initialization does not overwrite a saved range.
- The 30-second bound keeps the worker polling within existing watchdog freshness limits.
- Concurrency remains 32. Pool and memory settings were preserved.

Verification: local application type checks, isolated VPS production build, mock range API/validation tests, random timer/device cooldown tests (including a live in-memory change to 4–4 without restarting), order tests, and age tests passed. Live verification confirmed the saved 2–5 range in the authenticated API and compiled worker getter, both form labels in the admin bundle, and active worker polling. No real test WhatsApp message or synthetic production dispatch was created.

Existing queue health alerts remain `BACKLOG_AGE_EXCEEDED` and `SENDER_OFFLINE_WITH_BACKLOG`.

Backup: `/home/jeblast/backups/doran-dispatch-delay-setting-1791959783`. The deployment built in isolation, promoted `.next` and `dist` with rollback protection, restarted only the WA app, retained other PM2 process PIDs, and saved PM2. No schema migration was needed. Preserve dispatch rows and the additive setting on runtime rollback.

Deployment: `prepare-deploy-dispatch-delay-setting.py` and `deploy-dispatch-delay-setting-20261014.py`. Tests: `verify-dispatch-delay-setting.cjs` and `verify-dispatch-delay-setting-live.cjs`, with existing delay/order/age regressions.
