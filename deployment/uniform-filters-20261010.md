Deployed 10 October 2026 to https://dashboard.jeblast.com.

Audited every dashboard page. Ten search dropdowns on Phone, Contacts, Campaigns, Dispatch, Reports and Admin use the shared FilterSelect component. All is the default selection, always remains an option after choosing another value, remains visible while searching options, and is restored by clearing. Empty string means no restriction in existing API handlers.

Live browser tested all ten dropdowns. Nine had alternative options and passed default -> other -> All. Contacts had no groups; All remained available and selected. Also verified no-match option search retains All and clearing restores All. Existing device selectors for auto-reply and contact synchronization require a specific device. Remaining pages contain text/date filters, configuration inputs or pagination controls.

ESLint, TypeScript, production build and authenticated read-only verification passed. No test messages sent. Backup: /home/jeblast/backups/doran-uniform-filters-20261010.
