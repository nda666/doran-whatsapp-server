# Device API parity deployment

Deployed to https://dashboard.jeblast.com on 11 October 2026 (Asia/Jakarta).

Build ID: `_aGBDiYY-TJVEo4TAt-2q`.
Backup: `/home/jeblast/backups/doran-device-api-parity-1791677649` (previous runtime, changed source, manifests and build log).

The isolated Linux production build, mocked response/auth tests and API toolkit validation passed. Live verification confirmed 18 public/nonpublic route pairs, token auth through Bearer/body/query on session, Bearer/body dry-run on both send-message URLs, and query-token send-status on both URLs. Tests sent no WhatsApp messages and queued no test jobs. Eight authenticated dashboard pages and thirteen dashboard APIs passed read-only checks. All three public toolkit download hashes matched deployed files.

WhatsApp and dispatch remain enabled. Registered devices: 68; active: 65; online at verification: 16. Telegram process PID remained unchanged. Existing PDF guide was retained; API web documentation and Postman collection were updated.

Initial staging attempt failed only because the mocked attachment test inherited WHATSAPP_ENABLED=false. Test configuration was corrected; production was untouched during that attempt. The second attempt built and deployed successfully.
