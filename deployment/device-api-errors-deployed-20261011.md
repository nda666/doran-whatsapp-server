# Jeblast error metadata deployment

Deployed to https://dashboard.jeblast.com on 11 October 2026 (Asia/Jakarta).
Build: `JAaLXzZxXBJZeW_Bs7SCw`.
Backup: `/home/jeblast/backups/doran-device-api-errors-1791678296`.

Isolated build and tests passed. Live checks verified identical failures on 18 public/nonpublic device API pairs, each with `result:false`, `message`, and `curl_error:null`. Token Bearer/body/query and dry-run checks passed. Eight authenticated dashboard pages, thirteen read-only dashboard APIs and all toolkit download hashes passed.

WhatsApp and dispatch remain enabled; 68 devices registered, 65 active and 16 online at verification. Telegram PID unchanged. No WhatsApp test messages or test jobs were sent. Kasir production was not modified by this deployment. The existing PDF guide was retained; web API documentation and Postman JSON were updated.
