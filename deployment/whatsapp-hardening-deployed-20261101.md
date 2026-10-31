# WhatsApp hardening — production deployment

Deployed 1 November 2026, 00:39:05 WIB.

Final build: `KOcAmf25Berl7xj0Y9g1T`.

Private rollback backups:

- `/home/jeblast/backups/doran-whatsapp-hardening-1793467783`
- `/home/jeblast/backups/doran-whatsapp-hardening-1793468171`

The second deployment includes the final restriction-held retry eligibility fix, outgoing retry-device message lookup, PN/LID fallback and STOP-before-protocol-storage ordering. Sender-group 463 fallback remains enabled and waits **60 seconds**.

## Validation

- Local production build and TypeScript compilation passed. The initial concurrent Windows build hit an open-file limit; the subsequent build passed.
- Both production deployments passed an isolated Linux production build and the full offline regression suite, including the new auth/restriction/consent/cache tests and the 60-second sender-group regression. Existing platform-specific Python skips remain.
- Real MySQL tests passed after additive schema creation: identity-preserving legacy credential import, encrypted token roundtrip, competing lease rejection, stale-writer fencing and logout tombstone. Only synthetic rows were used and cleaned up.
- Historical migration records and row counts of preexisting tables were unchanged by schema upgrade/testing. Existing STOP preferences were then explicitly enabled, preserving alert settings.
- Runtime/source hashes matched the deployment manifest. Other PM2 processes retained their process IDs.
- Authenticated production requests to device policies, messaging preferences and recipient consents returned 200. STOP was enabled. No consent records were fabricated.
- The dashboard was inspected in the existing signed-in Chrome session. The permission form is present, STOP is on, and WhatsApp restriction indicators appear separately in the device health column.
- Production key inspection found zero unencrypted records in the new auth-key table. Original legacy session files are retained for recovery; active sessions use the encrypted DB after import.
- No WhatsApp test messages were sent. Normal queue processing resumes as devices reconnect.

## Operational notes

First-time imports run in bounded batches and complete per device before its socket is opened. Imported devices reconnect without rescanning QR. Devices that are inactive or lack valid linked credentials need their usual review/pairing; this deployment does not lift WhatsApp account restrictions.

Final verification at 00:56 WIB: all **50** active linked legacy sessions finished import, **0** linked imports remained, **48** devices were online, and **978,246** auth-key rows were encrypted. All 40 deployed source hashes matched. STOP was enabled on all stored preferences. Device-policy, messaging-settings and consent endpoints returned 200.

Two devices initially could not import because existing key files were empty: 52 pre-key files on Doran - GHL II and two session/sender-key files on Store DG Bali TSM. Five same-identity private snapshots had no valid copies of these files. Only the 54 confirmed zero-byte files were moved, not deleted, to `empty-key-quarantine` under the final backup, while holding each device's exclusive auth lease. Main credential file hashes remained identical. Both imports subsequently completed. No valid key or credential was replaced. The legacy auth directory is now mode 0700.

The dispatch-health endpoint returns 503 while reporting queue warnings; it is **not an all-green health check**. The worker is running, with 48 connected sockets. Remaining diagnostics include old backlog/offline devices and `CLAIM_STALLED`; `POLL_STALE` also appears intermittently because the existing poll delay is **60–75 seconds** while the old watchdog threshold is fixed at **60 seconds**. Read-only checks found no long-running SQL query. The configured send hours remain **06:00–23:00 WIB**, so no real outbound send was attempted during this midnight verification. Queue rows, send hours and configured delays were not reset to hide these warnings.

Detailed sanitized final verification is saved locally at `tmp/whatsapp-hardening-final-verification.json`.

See [implementation and API contract](whatsapp-hardening-20261101.md). Evidence logs are `whatsapp-hardening-deploy-20261101.log` and `whatsapp-hardening-followup-deploy-20261101.log`; detailed server checks and private snapshots are in the backup directories above.
