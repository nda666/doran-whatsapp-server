Deployed 10 October 2026 to https://dashboard.jeblast.com/dashboard/phone.

The name search matches either device name (`name`) or WhatsApp account name (`account_name`) using partial text. The label and placeholder explain both fields. Owner scope, number, connection and active filters remain combined with the name OR condition. Count and paginated rows share the same filter.

Verification: local TypeScript and ESLint passed; mocked API regression passed for device-only and account-only matches, owner isolation, combined filters, empty search and no matches. Staging production build passed. Authenticated live page/API smoke checks passed. Live search for the existing account name Doran Gadget Samarinda returned its device despite a different device name, matched the database count, and passed combined Offline/Active filters. Authenticated phone HTML contains the new label.

Backup: /home/jeblast/backups/doran-phone-name-search-20261010. Deployment includes automatic rollback. Source hashes matched; Telegram PID and WhatsApp/dispatch configuration were preserved. Staging and temporary archives removed.
