Deployed 15 October 2026 (WIB).

Build: `5dViu9dirDkOPFStPZcsY`.
Backup: `/home/jeblast/backups/doran-dispatch-summary-caption-1792075737`.

The dispatch summary subtitle is omitted after Cari applies filters. Page reload or a fresh visit restores the existing subtitle. The Refresh button and polling retain the filtered state with no subtitle. SummaryCards now accepts an optional caption and omits its paragraph when absent.

Validation: ESLint, isolated production build including TypeScript and existing regression checks, production API and public asset verification. Browser verification confirmed subtitle visible initially, absent after Cari, still absent after Refresh, and visible after page reload. Staging was cleaned and the previous deployment backup retained under the repository retention policy.
