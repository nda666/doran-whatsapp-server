Deployed 10 October 2026 to https://dashboard.jeblast.com/dashboard/contacts.

Import opens a modal with group selection, CSV/XLSX input, CSV template download and an explicit submit button. Import guidance appears inside the modal.

Sync opens a modal with device and group selection, explanatory text and a process button. The modal stays open after completion and shows found, added and duplicate counts, including a zero-contact result. Device/group errors stay in the modal. Selecting different options clears the previous result. Each sync processes up to 10,000 cached device contacts.

The sync API retains its count field and adds found and skipped. Duplicate contacts remain skipped. Access checks still scope device and group to their owner. No schema migration.

Verification: TypeScript and ESLint passed locally; isolated API regressions covered counts, duplicates, zero contacts, group assignment and access rejection. Full Next.js/server build passed on staging copied from the latest live source. Promotion verified eight authenticated pages and thirteen read-only API routes. Source hashes matched the deployment manifest. Existing lint/i18n warnings remain. Telegram PID and WhatsApp/dispatch flags were preserved.

Backup: /home/jeblast/backups/doran-contact-modals-20261010. Previous runtime and source are retained for rollback. Production build ID is checked before promotion to detect concurrent deployments.

Final live checks: public authenticated contacts bundle contained all new modal labels; public CSV download matched the deployed file; the live sync API rejected an inaccessible device with the new error response. No contacts or groups were changed for verification and no test messages were sent. Temporary server staging and upload archive were removed. Browser interaction testing was unavailable because the browser session required sign-in.
