# WhatsApp/Baileys hardening — 1 November 2026

## Behavior

- Sender-group messages explicitly rejected with 463 retain their dispatch identity, pause the rejected device, and become eligible for another sender after **60 seconds**. Existing ACK ambiguity protections remain in effect.
- WhatsApp reach-out restrictions are stored independently of manual pauses and the application's transport score. Active restrictions block sending even after the advertised expiry until an authoritative query or notification clears them. Checks are coalesced, run on connection and every five minutes, and are refreshed before sending when stale. Failed initial checks hold messages for a retry rather than assuming permission.
- New-chat capacity is displayed when WhatsApp supplies it; an absent value does not become a made-up allowance. This release does not promise a safe daily message quota.
- Credentials and all Signal/privacy keys use AES-256-GCM with record-specific associated data. The encryption secret is `WA_AUTH_ENCRYPTION_KEY`, falling back to `SETTINGS_ENCRYPTION_KEY` then `NEXTAUTH_SECRET`. Preserve the selected secret with the private backups. Changing it without re-encrypting records makes sessions unreadable.
- Each device has a 120-second database lease, renewed every 30 seconds. Writes verify lease ownership under a row lock; losing the lease retires the socket. Legacy JSON sessions are imported in bounded batches, and used only after the completion marker. Original files are retained for recovery; they are no longer the live credential store after import. Logout retains a migration tombstone so stale files cannot resurrect a session.
- Recovery and connection inspection read DB credentials first. Database/storage errors never silently create a replacement identity.
- Encrypted protocol messages support `getMessage` for seven days, independently of optional chat history. Expired records are removed. Group metadata has a bounded five-minute cache, coalesced lookups and event invalidation.
- STOP is on by default for accounts without saved preferences. The operational activation script enables it on existing preferences while preserving alert settings. STOP records revocation and suppresses queued messages atomically. Existing suppressions stay effective.
- Recipient permissions are recorded from actual evidence, scoped by account and category. No historical delivery, incoming chat or QR pairing is automatically classified as permission. No blanket consent is invented, and this release does not retroactively require evidence on every existing queue item. Transaction/job deduplication remains in force; API callers should reuse `job_id` or `transaction_id` when retrying a request.

## API contract: /api/recipient-consents

Uses the existing authenticated dashboard/API middleware. Every operation is scoped to the authenticated owner, including admin accounts. Responses are `Cache-Control: no-store`.

- `GET ?page=1&q=628…`: `{data, total, page}`, up to 50 current permission records per page.
- `POST`: `{number, purpose, source, evidence, grantedAt, consentConfirmed: true, resumeAfterOptOut?: false}`. Purpose is `ORDER_UPDATES`, `MARKETING` or `SUPPORT`. `grantedAt` must be an ISO timestamp with a timezone and cannot be in the future. The request records both current state and an immutable audit event. Returns 201. Invalid input returns 400. A previously opted-out recipient requires new permission dated after the opt-out plus explicit `resumeAfterOptOut: true`; otherwise returns 409. Previously suppressed messages are never replayed by this request.
- `DELETE`: `{number, reason}` revokes all recorded categories for that recipient, appends an audit event, adds a suppression and suppresses queued messages in the same transaction. Returns `{success:true}`.
- Other methods return 405. The UI is in the existing messaging preferences panel.

## Operations

Back up the database, environment and session files before applying the six additive tables. No historical migration records or existing message rows are rewritten by the schema change. Keep both old runtime and a way to export DB credentials to legacy JSON before rollback. Do not roll back to stale legacy keys after the new runtime has written updated keys.

Baileys remains an unofficial transport. These changes improve state consistency, diagnostics and handling of restrictions; they cannot guarantee protection from account restrictions. A WhatsApp Business Platform migration needs separate account setup, approved templates, costs and business decisions and is not provisioned by this release.

## Verification

`node deployment/ci-tests.cjs` includes offline encryption/auth lease tests, corruption and logout tests, restriction tests, permission API isolation/revocation tests, cache tests and the sender-group 60-second timing regression. No test sends WhatsApp messages. Full production builds and live read-only verification are recorded separately in the deployment report.
