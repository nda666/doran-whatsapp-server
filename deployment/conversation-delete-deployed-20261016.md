# Delete conversation

Deployed 16 October 2026 (Asia/Jakarta).

Added a red trash button in the conversation header and a confirmation dialog explaining permanent dashboard history/attachment deletion, WhatsApp message retention, and recreation when new messages arrive. Successful deletion closes the panel and reloads the list. Sending/pending replies block deletion in the UI; the API also blocks SENDING messages.

DELETE /api/conversations/[id] enforces authenticated owner scope on the conversation and device, rechecks ownership under the same phone lock used by capture/send, cascades database messages, and removes private chat attachment copies after commit. Shared uploaded source assets are retained.

Validation: source TypeScript and targeted lint passed. Unit/regression checks, isolated production build and authenticated API tests passed, including cross-owner rejection, sending guard, archived deletion, cascade, media cleanup, repeat deletion, and new incoming recreation. Test fixtures removed; no WhatsApp messages sent. Served frontend asset, runtime process health, backup success, and stage cleanup verified.

Build: `IIXugA6QqJ_DJLsLwWN2n`.
Backup: `/home/jeblast/backups/doran-conversation-delete-1792116412`.
Log: `/home/jeblast/conversation-delete-deploy-20261016.log`.

Post-promotion authenticated tests against the live process at 127.0.0.1:3000 passed, including deletion and fixture cleanup. Public-host checks from the server returned Cloudflare 520 or timed out, while existing dashboard access logs continued to show HTTP 200 for user sessions and Socket.IO. Public browser verification was unavailable because browser CDP calls timed out. Proxy configuration was inspected read-only and was not modified.

Retry on 16 October 2026: public HTTPS session endpoint returned 200 from both the user's machine and the production host. Full authenticated conversation API checks through https://dashboard.jeblast.com passed, including conversation deletion, ownership, sending guard, cascading messages, attachment removal, and new incoming conversation recreation. Disposable fixtures removed; no WhatsApp messages sent.
