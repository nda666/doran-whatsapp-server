# Balasan Otomatis: labels and activation controls

Deployed 14 October 2026. Indonesian device action/page title use “Balasan Otomatis”; device selector uses “Perangkat WhatsApp”; create button uses “Tambah Balasan”; modal titles use “Tambah/Edit Balasan Otomatis”; table uses “Status Balasan” and localized status/matching text.

Added Phone.autoReplyEnabled, default false, exposed in add/edit forms under “Aktifkan Balasan Otomatis” and validated by the owner-scoped device API. Added active/inactive rule selection under “Aktifkan Balasan Ini”; create defaults inactive, editing loads existing status, invalid status returns 400, omitted update status preserves the existing value. New records default inactive. Migration enables existing devices only when they already have active rules, preserving existing automations and existing rule statuses.

Disabled devices skip normal/quoted reply processing and associated rule queries/media work. Active-rule retrieval also filters the related device flag. Sending checks both gates and rechecks stored status after delay. Device-level incoming Webhook and Save Group remain separate features.

The rule form initializes the keyword type and resets it between drafts; list-menu saves follow the same save path as other types.

Validation: mocked behavior/API checks, keyword tag regression checks, source TypeScript passed. ESLint: zero errors, two existing hook-dependency warnings. Isolated Linux Prisma generation and production Next.js/server build passed. Private database dump and migration completed. Authenticated HTTPS bundles, API/database device-status consistency, and database defaults verified. Live Chrome confirmed page/button/column/menu labels, inactive default on new reply/device, and edit-device status. Draft inspections cancelled without saving records or sending WhatsApp messages.

Build: `B2HvZvmg8btlVHh2OR0fW`.
Backup: `/home/jeblast/backups/doran-auto-reply-controls-1791952636`.
Log: `/home/jeblast/auto-reply-controls-deploy-20261014.log`.
Screenshot: `output/auto-reply-controls-live-20261014.jpg`.

Source baseline/digests verified. Database/source/runtime/Prisma client backed up. Automatic runtime rollback preserves additive migration history. PM2 online; WhatsApp/dispatch flags and Telegram PID preserved.
