# WhatsApp automatic recovery — ready for deployment

Status: deployed successfully on 16 October 2026 after the user explicitly authorized deployment. Production build `IqdFUjn6Th9SEc-Zos5tW`; backup `/home/jeblast/backups/doran-wa-recovery-1792085077`. See `wa-recovery-deployed-20261016.md` for validation. The earlier upload approval block was resolved by the user's permission.

Read-only production inspection found 39 devices online, 20 active devices offline and one inactive device. The offline JETE Nota devices in the screenshot have no `creds.me.id` in their current auth files. Nota 13 remains online and has a linked identity. Several offline devices repeatedly close with code 408 while awaiting QR; this does not establish why their previous credentials disappeared. No credentials were printed or copied.

Changes:

- Recover saved, linked sessions at startup and every 30 seconds, replacing the old 30-minute sweep.
- Replace closed cached sockets and connections stuck for at least 120 seconds; let the existing Baileys keepalive handle loss on established connections.
- Reuse pending creations and shared recovery state across Next.js API bundles and the server.
- Respect pending backoff timers, maintenance, inactive devices, terminal disconnects, disabled WhatsApp and shutdown. A manual attempt can clear the terminal block.
- Wait for auth writes before reconnecting. Database status-write failures no longer prevent transport retries.
- Stop retrying expired unpaired QR sessions automatically. Scan QR manually to establish the session; subsequent transient loss can recover using saved credentials.
- Follow-up 16 October: list rows and connection details now describe whether QR is required, automatic reconnection is running/waiting, pairing is completing, the device is inactive, or the connection needs admin attention. Missing auth means QR; unreadable or malformed auth means unverified. Terminal 403/440/411/500 errors have specific guidance. Only a confirmed missing link offers a direct Scan QR button. Failed list refreshes remove stale connection labels and show a warning. No private credential data is returned by the status resolver.

Validation passed: source-only TypeScript check (`deployment/tsconfig.phone-cleanup-check.json`), `verify-phone-connection-info.cjs`, `verify-wa-recovery.cjs`, `verify-connection-status.cjs`, and `verify-phone-cleanup.cjs`. Status tests cover online, QR required, logout even with leftover credentials, pairing, recovery, inactivity, maintenance, server disabled, terminal codes, corrupt or unreadable credentials, and credential privacy. Recovery tests include missing/closed/stuck sockets, healthy and connecting exclusions, QR expiry, terminal disconnect, timer coordination, concurrent sweeps, DB failure and per-device isolation, plus manual replacement and coalesced socket creation. The root local TypeScript project includes historical files under tmp/deployment and fails on those existing copies; the source-only project passes. Full isolated production Next.js and server TypeScript builds also passed during deployment.

Deploy package: `wa-recovery-20261015.zip`; script: `deploy-wa-recovery-20261015.py`. The package validates production baseline hashes, builds/tests in isolated staging, backs up runtime/source, promotes only this app and rolls back on failure. Existing stage cleanup and backup retention helpers are reused. No database migration is needed.
