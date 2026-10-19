Deployed and verified 15 October 2026 at 19:17 WIB.

Build: `wO5hPytMNxNDB9KEZp8m2`.
Backup: `/home/jeblast/backups/doran-dispatch-ack-validation-1792066564`.

ACK handling now keeps waiting for a valid server acknowledgement when the first TAG:id stanza is unexpected or contains a temporary/unknown rejection. The overall 40-second deadline is unchanged. On timeout the existing 1/2/4/8-minute retry schedule and five-attempt cap apply. Late valid ACKs or receipts cancel further retries. Explicit WhatsApp error 463 becomes FAILED with WA_ACK_463_ACCOUNT_RESTRICTED; the installed Baileys implementation documents this as an account restriction that should not be repeatedly retried. Diagnostics log only sanitized stanza tag, numeric code, fixed reason and internal IDs, never message payloads or tokens. Other immediate transport exceptions still become UNCERTAIN.

User-requested order: isolated build and tests, graceful worker stop, reset sender's uncertain messages, promote new runtime, restart. Exactly 71 API dispatches from sender 6285217857965 dated 15 October WIB were reset at 19:16:44 WIB to QUEUED with zero attempts, null messageId/error/lease fields, fresh createdAt/nextAttemptAt and a new 24-hour expiry. Dispatch IDs, transaction identifiers and payloads were retained. Delivered/sent jobs were excluded. Status transitions generated normal webhook outbox entries. The before snapshot and reset verification are stored in the backup directory. Automatic deployment rollback also restores untouched reset rows before restarting the old version.

Validation passed: synthetic invalid/temporary ACK followed by timeout, invalid ACK followed by valid ACK before/after deadline, permanent 463, late receipts/races, exact retry schedule and limit, normal success, early transport errors, queue ordering, age settings, device delay, isolated Next.js/TypeScript production build, source/runtime hashes and PM2 startup. Production read-only verification exercised compiled ACK handling and returned HTTP 200.

At 19:17:29 WIB, the 71 reset jobs comprised 66 QUEUED, 1 SENT, 4 DELIVERED and no UNCERTAIN. Sender OPEN/active. All 85 webhook events since reset were still PENDING at that snapshot; enqueueing is not proof of receipt by the cashier.
