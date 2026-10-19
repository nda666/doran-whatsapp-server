# Dispatch table changes — ready for deployment

11 October 2026 (Asia/Jakarta). Production has not been changed.

- Job ID column uses caller clientJobId; legacy rows fall back to internal dispatch id. Dashboard API exposes job_id and allows sorting by clientJobId.
- Store shows the stored store_id directly, including default, matching the API parameter.
- Search label and placeholder now say Nama store / Cari nama store. Existing exact store_id filtering is retained.

ESLint for both changed source files, TypeScript for application sources, mocked job-search/row projection regression checks and dispatch presentation/detail checks passed.

Package: deployment/dispatch-table-20261011.zip (two source files, regression verification, read-only live verification).
Deployment: deployment/deploy-dispatch-table-20261011.py. It checks baseline hashes, builds separately, backs up source/runtime, promotes the build, restarts doran-whatsapp and automatically rolls back on failed checks. No migrations. Telegram PID and WhatsApp/dispatch flags are checked.

Production baseline build: qnBrFQOaa_NSgfmyDu77n. Source hashes confirmed via read-only SSH to jeblast@103.196.146.186.

Automatic approval review rejected SCP upload because explicit approval was required for this payload and destination. No package was uploaded and no production process restarted. Awaiting user authorization to upload and deploy this package to the existing Jeblast VPS.

## Deployment completed

User explicitly approved deployment. Successfully deployed on 11 October 2026 (Asia/Jakarta).
Build: T0dyCd33uAVMNiN-kuEUg.
Backup: /home/jeblast/backups/doran-dispatch-table-1791699454.

The first staging attempt stopped because of an incorrect test-script filename, before production changes. Corrected to verify-dispatch-job-search.cjs and retried successfully.

Isolated regression tests and full production build passed. Authenticated live verification confirmed Job ID and Nama store labels, returned Job ID/store values against database records, store filtering, job sorting and existing job searches. Eight dashboard pages and thirteen read-only APIs passed. Source hashes matched the package. Dashboard online; WhatsApp/dispatch enabled; Telegram PID preserved. No verification WhatsApp messages sent.
