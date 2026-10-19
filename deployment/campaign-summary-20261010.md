Deployed 10 October 2026 to https://dashboard.jeblast.com/dashboard/campaigns.

The campaign table column is now titled Ringkasan pengiriman. Each row displays separate labeled counts for Terkirim, Gagal, Antrean, and Perlu diperiksa. Existing status aggregation is unchanged; color supplements the labels.

Local TypeScript and ESLint passed. Full staging production build passed using the latest live source. Public authenticated HTML and campaign JavaScript verified the new header and four labels, with the old slash-separated title absent. Eight authenticated pages and thirteen read-only API routes passed. Source hashes matched the manifest. Build ID: ZG5AGsDbWtnPVurAeq48u. No campaign records existed during live verification, so populated rows were not inspected interactively. Existing unrelated lint warnings remain.

Backup: /home/jeblast/backups/doran-campaign-summary-20261010. Previous source and runtime retained for rollback. Telegram PID and WhatsApp/dispatch flags preserved. No campaign created and no messages sent during verification.
