# Postmark sender email deployed

Deployed 17 October 2026 (Asia/Jakarta) after explicit user approval.

Global Settings includes `Email pengirim Postmark` (`postmark-from-email`), initialized to `wa@dorandev.com`. Valid edits apply to the next password-reset email without restart. API and form validation reject invalid addresses; the stored value uses existing settings encryption.

Validation: focused regression passed locally and in isolated production build; TypeScript and targeted ESLint passed locally; production build completed. Authenticated HTTPS API verified the setting and default value, encrypted storage, rejection of an invalid edit without changing the stored value, and unauthorized access rejection. Active admin bundle and public build matched. No real emails were sent. Deployment assertions verified PM2 online, WhatsApp/dispatch flags enabled, and Telegram PID preserved. Staging cleaned up.

Build: `p3buuUtzG5zHWlYQ6BGM2`.
Backup: `/home/jeblast/backups/doran-email-from-1792199169`.
Log: `/home/jeblast/email-from-deploy-20261017.log`.

The remote deployment script succeeded. The surrounding SSH shell returned an error from its trailing exit-status expression after successful deployment; independent log and live checks confirmed success.
