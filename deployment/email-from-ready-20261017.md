# Postmark sender email setting

Deployed 17 October 2026 after explicit user approval. See email-from-deployed-20261017.md for verification.

Global Settings now initializes `postmark-from-email` (Email pengirim Postmark) with `wa@dorandev.com` and preserves existing edits. The edit form provides an email input and verification guidance. The API validates a plain email address and stores it using existing encrypted settings storage. Password-reset delivery reads the sender on each attempt; installations without the row retain the original sender. Invalid stored addresses fail before a provider request. No schema migration is needed.

Validation: `node deployment/verify-email-from.cjs` covers default sender, initialization, invalid addresses/header injection, editing, persistence, live setting reads and stream alternation with a stubbed provider. No real emails were sent.

The package `email-from-20261017.zip` contains four application source files plus the focused verification script, SHA-256 manifest and a baseline fetched from the Jeblast VPS. `deploy-email-from-20261017.py` builds in isolation, checks for concurrent changes, backs up the runtime and source, and promotes with automatic rollback. It has not been uploaded or executed. Automatic approval review rejected SCP upload of source and deployment logic to `jeblast@103.196.146.186:/home/jeblast/` because exact payload/destination authorization is required.
