# Postmark setting descriptions deployed

Deployed 17 October 2026 (Asia/Jakarta), following explicit user approval.

Updated help for Email pengirim Postmark and Postmark Server Token to describe their scope as all application email, including password resets, admin notifications, and other email processes. Sender edit form shares this description. This deployment changes informational text only.

Validation: targeted ESLint and isolated production build passed. Both descriptions verified in deployed admin bundle. Public HTTPS build matched, all PM2 processes online, staging removed. Deployment also verified WhatsApp/dispatch flags and preserved Telegram PID.

Build: `U0BCoH908TxmznvZeiy1U`.
Backup: `/home/jeblast/backups/doran-postmark-info-1792199404`.
Log: `/home/jeblast/postmark-info-deploy-20261017.log`.
