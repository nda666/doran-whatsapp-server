Deployed 10 October 2026 to https://dashboard.jeblast.com/dashboard/api-docs.

Simplified the warning about WhatsApp button/list compatibility and explained safe API token placement using POST JSON and Authorization: Bearer TOKEN_DEVICE. Only the warning copy changed.

Production Linux build passed in staging copied from current live source. Promotion guarded against concurrent build changes and retained automatic rollback. Public authenticated HTML and JavaScript assets contained the new text and matched production build CyCL7_SYvlmh48D7EVtjG. Eight authenticated pages and thirteen read-only API routes passed. All 68 devices remained registered, runtime flags were preserved, and the Telegram process PID was unchanged. No test messages sent.

Backup: /home/jeblast/backups/doran-api-docs-copy-20261010.
