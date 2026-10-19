# Webhook optional parameters save fix

Deployed 16 October 2026 (Asia/Jakarta).

Confirmed production error: Prisma rejected isi_param_3 as empty string instead of ParamType. API normalizes empty, omitted and null isi_param_1/2/3 to null and rejects unsupported nonempty selections with HTTP 400. Form no longer initializes optional enum selections to empty strings; Custom input visibility follows watched form values, including edit initialization and reset.

Validation: source TypeScript passed; API regression covers create/edit, all empty variants, all five enum values, mixed optional fields, manual values and invalid selection. Existing modal lifecycle and activation regression checks passed. Isolated Linux production build and deployment checks passed. Production HTTPS create and edit returned 200 with blank optional params; persisted nulls, Custom/Sender selections, manual values, clearing params and invalid selection 400 verified. Used only an inactive temporary rule on an admin-owned device with automatic replies disabled. Temporary rule removed and absence verified. No messages or webhook requests sent. Authenticated HTTPS UI/API/database checks passed.

Build: `RTEGRF4hTZyO9MONffwRt`.
Backup: `/home/jeblast/backups/doran-webhook-optional-params-1792089366`.
Log: `/home/jeblast/webhook-optional-params-deploy-20261016.log`.
Staging cleaned and backup retention completed. WhatsApp/dispatch flags and Telegram PID preserved. Live verification script updated after deployment to select an admin-owned disabled device automatically; runtime sources unchanged by this verification adjustment.
