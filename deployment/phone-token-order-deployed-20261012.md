# Token API column order — 12 October 2026

Deployed build `H_ygtHlLAGyWfOgAHuHRt` to `/dashboard/phone` after explicit user approval.
Backup: `/home/jeblast/backups/doran-phone-token-order-1791769196`.

Moved Token API immediately after Save Group, before the optional admin ownership column. Label remains on one line; other column behavior is unchanged.

Validation: local ESLint passed with two existing hook dependency warnings; isolated production Next.js/server build passed; authenticated HTML confirmed the first seven columns and all JavaScript assets loaded successfully. Browser verification using the existing admin session confirmed Save Group → Token api → Kepemilikan in the populated table. Screenshot: `output/phone-token-order-live.png`.

The first deployment automatically rolled back because the verification incorrectly required the optional ownership column during server rendering. The verification now checks the requested first seven columns and the second deployment passed. Telegram PID and enabled WhatsApp/dispatch flags were preserved. No tokens, device settings, or messages were changed during verification.
