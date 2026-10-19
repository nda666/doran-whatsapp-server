Deployed and verified 15 October 2026 at 19:26 WIB.

Build: `WUCT_-G4ESk1gTsWK9S_8`.
Backup: `/home/jeblast/backups/doran-recipient-syntax-1792067123`.

Recipient checks now normalize international telephone syntax and recognized country codes without enforcing libphonenumber operator-pattern validity. Legacy/short numbers such as +6179063947 are admitted for a WhatsApp transport attempt without guessing or appending digits. Indonesian local prefixes and existing +62/62 forms share normalization, including short numbers where metadata parsing previously duplicated the country code. Basic syntax, length (5–15 digits), unsupported country-code and malformed text checks remain. This is not a claim that a number is registered on WhatsApp or that delivery will succeed.

The shared normalizer is used in queue preparation, legacy text/attachment validation and their transports. Existing contact/campaign/dashboard check-number paths also reuse it. Device registration validation is unchanged. Catalogue notes for 24 sending operations and the API guide generator describe the policy.

Validation passed: queue, validators and mocked legacy transports for the reported international number; short Indonesian forms; formatted standard numbers and AU country selection; rejection of malformed text, unknown country codes and oversized numbers; equivalent-format deduplication; ACK retry/order/device-delay/age regression suites; isolated Next.js and TypeScript build; source/runtime hashes and PM2 startup checks.

Production verification accepted +6179063947 in normalization and queue preparation. Authenticated POST /api/send-message with JSON dry_run=true returned HTTP 200/result=true/dry_run=true/recipient_count=1. No dispatch was created and no real test message was sent. Previously rejected invoice DGBALI-33166 must be resubmitted by the cashier because its request was rejected before queue persistence.
