# Connection status correction — 13 October 2026

Deployed to production on 13 October 2026. Build ID: `VeWD8TiGWFbAv3_jq6jg7`. Backup: `/home/jeblast/backups/doran-connection-status-1791886240`.

The connection event handler previously marked a device online only when Baileys emitted `isOnline: true`. An open connection did not restore the database flag after disconnect/re-pairing. Presence and connectivity were conflated. The device table also received events without updating its rows.

The handler now persists `isOnline: true` on `connection: open` and false on `connection: close`, before emitting the dashboard status notification. Presence-only events do not change device connectivity. Existing reconnect and QR restart behavior is retained.

The device page refetches on connectivity notifications, socket connection and QR modal close, and every ten seconds while visible. Socket options remain stable across data refreshes, avoiding a reconnect/refetch loop. Refetches preserve the API's filtering, sorting and pagination.

Validation: `node deployment/verify-connection-status.cjs` passes isolated checks for open connection with hidden presence, presence-only updates, close, QR restart, reconnect without a presence event, persistence before notification, and stale socket rejection. No messages were sent and no database or credentials were accessed. Type checking must target current source; the root TypeScript include patterns also pick up incomplete historical copies under `tmp`.

The package contained the two changed source files and the isolated verification script. Production baseline hashes were checked before staging. The connection-status, session-outage and user-active tests passed, followed by the production Next.js and server TypeScript builds. Source/runtime backups were created and the runtime was promoted using the existing automatic rollback workflow. Deployed source hashes matched the package. No database migration was needed.

Post-deployment verification (`verify-connection-status-live.py`) confirmed number `6282324272321` has `isOnline: true`, `active: 1`, and an `open` connection event at 17:11:23 WIB. `doran-whatsapp` is online with PID 1189202. `telegram-sender` remained online with unchanged PID 310531. The public signin endpoint returned HTTP 200. No real test messages were sent and no QR rescan was induced. The authenticated dashboard display still requires the user's browser to reload the new frontend bundle.
