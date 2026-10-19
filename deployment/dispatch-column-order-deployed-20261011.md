# Dispatch column order deployed

11 October 2026 (Asia/Jakarta), https://dashboard.jeblast.com/dashboard/dispatch.

Order: Pengirim, Penerima, Status, Dibuat, Percobaan, Job ID, ID transaksi, Store, Jenis pesan, Via, Keterangan, Aksi.

Build: m42kRoYodaYyRsij5EVHI.
Backup: /home/jeblast/backups/doran-dispatch-column-order-1791700706.

ESLint and isolated full production build/regression checks passed. Authenticated live HTML headers matched the requested complete order. Existing Job ID/store searches and API row projection checks passed. Eight dashboard pages and thirteen read-only APIs passed. Source hashes matched the deployment package. Dashboard online, WhatsApp/dispatch enabled, Telegram PID unchanged. No test WhatsApp messages sent.

First promotion rolled back automatically due to a duplicated variable name in the new live verification script. The script was corrected and syntax-checked, then deployment succeeded.
