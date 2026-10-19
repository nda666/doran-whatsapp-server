# Compact phone table

Deployed 16 October 2026 (Asia/Jakarta).

Connection status displays a clickable information icon; scan_qr is labeled Offline, with Scan QR inline. Existing explanations and QR eligibility are preserved. Account names and labels wrap at spaces within 20 characters, leaving long single words intact. API tokens wrap after the third hyphen; Copy uses the original value. Per-device Generate Token moved into Aksi and retains its existing confirmation, permission checks and busy state.

Menu order: Scan QR, conversations, test send, automatic replies; edit, generate token; connection info, device ID, user ID; activate/deactivate, delete.

Validation: focused lint passed with one pre-existing effect dependency warning. Word-boundary and token formatting checks passed. Isolated production build, server compilation and existing regressions passed. Browser verified both exact status descriptions on click, all five visible token rows breaking after the third hyphen, no Generate Token in token cells, dropdown order, and token confirmation opened then canceled without changing credentials. WhatsApp startup and unchanged Telegram process verified by deployment script.

Build: 6A1XeXoTUfku3C6fmqi65
Backup: /home/jeblast/backups/doran-phone-table-compact-1792113773
Log: /home/jeblast/phone-table-compact-deploy-20261016.log
