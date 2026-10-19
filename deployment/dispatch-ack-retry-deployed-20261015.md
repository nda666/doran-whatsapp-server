Deployed 15 October 2026, verified at 17:59 WIB.

Build: `nvPHxLfuN7J5161PMKHJ9`.
Backup: `/home/jeblast/backups/doran-dispatch-ack-retry-1792061876`.

When a send exceeds the 40-second confirmation deadline, the same dispatch is queued for retry after 1, 2, 4, then 8 minutes. The fifth unsuccessful attempt changes the status to FAILED with ACK_TIMEOUT_RETRY_EXHAUSTED. Delays are minimum due times; device pacing, connectivity and queue position can postpone a send. Existing media preparation failures use the same attempts counter, as before.

Retry jobs preserve their WhatsApp message ID to correlate late receipts and reduce duplicate risk. A valid late ACK, delivery receipt or read receipt stops further retries; a receipt arriving between claim and transport is checked before sending. Duplicate delivery remains possible. Other transport errors and interrupted workers remain UNCERTAIN; old UNCERTAIN dispatches are not replayed automatically.

QUEUED retries report ACK_TIMEOUT_RETRY. Both send-status summaries and dispatch webhooks include next_attempt_at. Dashboard explanations and API catalogue notes describe the policy. No database schema migration is required.

Validation: isolated production Next.js/TypeScript build; synthetic clock/DB/WhatsApp tests for the complete retry schedule, attempt cap, stable IDs, premature-send prevention, late confirmations, receipt races, normal success, early errors and preservation of old UNCERTAIN jobs; regression tests for random device delay, queue ordering and age settings. No real WhatsApp test messages were sent.

Production verification passed: compiled retry policy, API/webhook schedule serialization, read-only Prisma eligibility query, HTTP 200, source/runtime hashes, PM2 app online with WhatsApp/dispatch enabled and unrelated sender process retained. Original dispatch 02f964e4-db79-4d17-b8f6-ffbd12f3298e remains UNCERTAIN with one attempt.
