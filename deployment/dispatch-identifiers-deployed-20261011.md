# ID Pengiriman dan Job ID Request — 11 Oktober 2026

Deployed to https://dashboard.jeblast.com/dashboard/dispatch and API Docs.
Build: `DNk5A9ryMEK97iEogw6ZK`.
Backup: `/home/jeblast/backups/doran-dispatch-identifiers-1791731975`.

The dashboard shows `id` as ID Pengiriman and `clientJobId` as Job ID Request. Missing client IDs remain null instead of falling back to dispatch IDs. Search still accepts either complete ID. The catalogue, generator, language samples, Postman downloads and PDF explain `data[].id -> send-status.id -> webhook.dispatch.id` and replace UUID_JOB with UUID_PENGIRIMAN.

Verified transaction 5553753: dispatch ID `c8f4cee8-ccb5-4148-b141-8e3bd4f4b479`, request job ID `544b803a-3a8c-40a8-bc31-e29e19d0df59`, status READ. No webhook or WhatsApp message was sent during this change.

Validation: local ESLint, dispatch search and request ID regressions, Postman schema/sample checks; isolated VPS production build; authenticated public API and dashboard chunks; all three download hashes. PDF rendered and inspected. UI screenshot: output/dispatch-identifiers-live.jpg. Telegram PID remained unchanged, WhatsApp/dispatch workers remained enabled.

An initial isolated build found a stale toolkit test helper; the current helper was included. A subsequent verifier checked only the Next.js route chunk instead of shared chunks and triggered successful automatic rollback. The verifier now checks all script chunks, and the final deployment passed.
