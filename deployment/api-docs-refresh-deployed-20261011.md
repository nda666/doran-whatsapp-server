# API documentation refresh — 11 October 2026

Deployed to https://dashboard.jeblast.com/dashboard/api-docs (Asia/Jakarta).
Build ID: `Ii90QZC6Oc6u9DGrxQ7TA`.
Rollback backup: `/home/jeblast/backups/doran-api-docs-refresh-1791687199`.

The page now renders endpoint requests, success/retry variants and errors from the shared catalogue. It documents Bearer/body/query authentication, public/nonpublic aliases, endpoint HTTP statuses, job_id versus per-recipient dispatch IDs, stable retry IDs, lookup precedence, JSON-only boolean dry_run, queue states/limits and device webhooks. The catalogue, five-language samples, Postman collection/environment and cURL PDF were synchronized (30 operations, 63 Postman requests, 47 PDF pages). Postman stores client job_id and internal dispatch_id separately; status-only requests no longer use send-response scripts.

Validation: local TypeScript (excluding existing scratch TypeScript in tmp), direct ESLint, official Postman schema, JS/PHP sample syntax, queue/payload contracts and request-job-id/send-response regressions passed. PDF pages were rendered and visually reviewed, and extracted text checked for obsolete contracts. The isolated VPS Next.js/server production build and regression checks passed before promotion. Live authenticated API Docs HTML/bundle, 18 route pairs, device token auth, safe dry-runs, client job lookup, 8 dashboard pages and 13 read-only APIs passed. All three download hashes matched through the public domain. Source hashes matched the package manifest.

No WhatsApp test message or dispatch job was created. WhatsApp and durable dispatch remain enabled. Telegram PID was unchanged. Existing build lint/i18n warnings remain. The deployment preserves a private source/runtime backup and automatically restores the old runtime on verification failure.
