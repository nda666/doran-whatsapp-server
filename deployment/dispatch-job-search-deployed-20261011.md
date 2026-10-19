# Dispatch Job ID search

Deployed to https://dashboard.jeblast.com/dashboard/dispatch on 11 October 2026 (Asia/Jakarta).

Build: `lyiLFo4pf3l8bYV-CzYO3`.
Backup: `/home/jeblast/backups/doran-dispatch-job-search-1791693464`.

The search form accepts a complete caller-supplied `job_id` or internal dispatch `data.id`, trims surrounding whitespace and composes with status, store, transaction, device and source filters. Request job keys are computed for accessible devices; dispatch queries retain the existing owner scope. No schema changes.

Mocked endpoint regression tests cover key hashing, internal ID lookup, filter composition, owner scope, clearing the filter and invalid values. Changed-file ESLint passed. Local whole-repository TypeScript checking encounters preexisting errors in `tmp/job-id-live-before/queue.ts`; the isolated Linux full production build, including TypeScript checking, passed.

Authenticated production checks passed for the new form, existing internal dispatch lookup, combined filters, missing IDs, invalid length and unauthenticated rejection. General checks passed for eight dashboard pages and thirteen read-only APIs. No verification messages or jobs were created. PM2 dashboard is online, WhatsApp and durable dispatch remain enabled, and Telegram retained its PID. Deployment source hashes matched the package manifest.

Rollback source and previous `.next`/`dist` are in the private backup. Deployment uses `deploy-dispatch-job-search-20261011.py`, with a source baseline check, isolated build and automatic rollback on failed promotion or live checks.
