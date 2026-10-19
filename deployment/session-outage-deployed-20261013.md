# Session outage guard deployed — 13 October 2026

The dashboard polled NextAuth sessions every 15 seconds. NextAuth's client fetch helper returns null for failed HTTP/JSON/network requests. AccountSessionGuard treated that value as an invalid account and called signOut; a failed logout navigated to /signout. This explains a possible path from transient server unavailability to the reported logout. The underlying cause of the reported 503 was not established.

AccountSessionGuard now confirms a missing session using a fresh, uncached /api/auth/session request before automatic logout. HTTP failures, malformed responses, network failures, and timeouts retry after five seconds without calling signOut. A confirmed active session refreshes the NextAuth session state. Successful null/empty-object responses and invalid account sessions still log out; account:disabled continues to revoke sessions. The automatic /signout fallback was removed. Unmounted checks abort and cannot initiate logout.

Deployment was authorized by the user. Source was packaged against production hashes, built and tested in isolation, then promoted with runtime/source backups and automatic rollback. No database migration was needed.

- Final build ID: `BjzRjROftNohh2Nd0ekuv`
- Original source/runtime backup: `/home/jeblast/backups/doran-session-outage-1791867175`
- Backup before final empty-session compatibility correction: `/home/jeblast/backups/doran-session-outage-1791867283`
- Package: `deployment/session-outage-20261013.zip`
- Deployment script: `deployment/deploy-session-outage-20261013.py`

Verification passed:

- `verify-session-outage.cjs`: repeated 503/network failures do not log out; recovery refreshes the session; confirmed expired/inactive sessions log out; cancellation prevents late logout; failed logout does not navigate to /signout.
- `verify-user-active.cjs`: deactivation, stale-session rejection, reactivation and fresh login remain enforced.
- Production Next.js build and server TypeScript build passed.
- Production source hashes match the package.
- Local and public signin/session endpoints return HTTP 200; unauthenticated device-page requests redirect to signin.
- Public browser bundle contains the new session confirmation logic.
- doran-whatsapp is online; telegram-sender retained PID 310531.

The production empty-session response is `{}`; verification uses curl because Python urllib received a proxy 403 on a public redirected request. No authenticated two-device test or real production outage was induced. The fix protects login cookies during transient session-fetch failures; it does not prevent server/proxy 503 errors.
