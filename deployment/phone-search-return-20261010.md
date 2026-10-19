Deployed 10 October 2026 to https://dashboard.jeblast.com.

Auto-reply has a Kembali ke Perangkat HP button. Phone filters, table page, size, sorting and filter visibility are carried in the URL to auto-reply and restored on return. The form reflects the applied filters. Return destinations are restricted to the phone page; input is parsed through an allowlist.

Validation: TypeScript passed; ESLint has zero errors and two existing phone socket-effect warnings. Serialization, invalid-input and Offline filter round-trip checks passed. Production build and authenticated read-only checks passed.

Live browser: searched name Doran, Offline and Active, changed to 10 rows, sorted name ascending, opened page 2, chose Daftar Balasan, refreshed auto-reply, clicked the new button. The exact search URL, filter form and all ten displayed device names were restored. No test message sent.

Backup: /home/jeblast/backups/doran-phone-search-return-20261010.
