# Auto-reply webhook investigation — 16 October 2026 (Asia/Jakarta)

Device: f84116e9-d10d-4772-9a50-8fbfcb8c2954. Rule: 78.

Confirmed production database: device OPEN, online, active, autoReplyEnabled true. Rule active, keyword Any, GET http://dorun.id/api/check_user_by_phone. is_save_inbox was false. No recent inbox results for this device (latest pre-existing record was August 2025).

Read-only endpoint probes from the production host, without message/phone query data: Python urllib received Cloudflare HTTP 403 / error 1010. Node fetch with application headers timed out at the diagnostic 15-second limit for both HTTP and HTTPS. These are diagnostic probes, not evidence of the user's earlier incoming-message webhook delivery.

Production source confirmed: webhook response is parsed and optionally stored, but is not automatically sent as a WhatsApp reply. sentCount is not incremented in the webhook branch, so zero does not prove absence of webhook requests. The default phone parameter overwrites the custom phone=Recipient mapping with the incoming sender. This mapping may need clarification based on the endpoint contract.

Changed only rule 78 is_save_inbox from false to true to capture subsequent completed webhook outcomes. Previous full row backed up on server at /home/jeblast/backups/auto-reply-78-inbox-before-20261016.json (mode 0600). Verified database and reloaded UI checkbox checked. No application code deployed and no WhatsApp messages sent.

Pending: user sends a plain direct incoming text from another number and supplies the message/time; correlate inbox response. Existing code writes the inbox after fetch completes, so requests still in flight do not yet appear. Historical request delivery remains unproven. Endpoint access and response-to-WhatsApp behavior remain unresolved.

## Incoming test confirmed

User sent `lemari` just now. Production InboxMessage 37373 captured `Lemari` at 2026-10-16 02:17:34 WIB (2026-10-15T19:17:34.579Z), recipient 6281217357535, GET http://dorun.id/api/check_user_by_phone. Response: {"result":true,"message":"No Event Data","data":[]}.

This confirms the live incoming-message handler invoked the configured webhook and received parseable successful HTTP JSON for this test. Earlier unparameterized diagnostic probes do not represent this successful real request. The endpoint returned no event data, and the existing webhook handler does not send its response as a WhatsApp reply. End-to-end WhatsApp reply remains absent; outbound webhook delivery is now confirmed.

## Follow-up: incorrect phone parameter confirmed

At 2026-10-16 02:50 WIB, live rule 78 still used HTTP, Any, GET, active, inbox logging enabled. Latest completed inbox requests were `/home` (02:46:10), `Hone` (02:46:34), and `Ketik apa saja` (02:47:56), each with HTTP 500. Sender stored as 278313914388723. No exact lowercase `home` in these completed records.

Read only the targeted LID mapping for this device: LID 278313914388723 maps to PN 6285231194683; reverse mapping also confirmed. Current normal/quoted handlers use remoteJid directly, then overwrite the phone parameter with that raw sender. Thus requests use the LID rather than the intended phone. This explains the parameter mismatch; the cause of Dorun HTTP 500 still needs endpoint-side verification.

Prepared local fix: src/server/utils/webhookSender.ts resolves PN JIDs, remoteJidAlt, then socket.signalRepository.lidMapping; rejects unresolved LIDs. Applied to normal and quoted auto-reply webhook payloads and inbox sender without modifying WhatsApp chat identity. Regression tests cover both handlers and the reported mapping. Targeted source TypeScript check and lint passed; initial broad check included unrelated stale backup files and failed there, so a source-only config was used successfully.

Deployment script prepared at deployment/deploy-webhook-sender-20261016.py, with live baseline checks, isolated TypeScript build, regression checks, backup, health checks, and automatic runtime rollback. Production deployment/restart was rejected by automatic approval review because troubleshooting did not explicitly authorize persistent production code changes and restart. No new code deployed, no restart performed, and URL remains HTTP. Awaiting user permission to deploy and change rule 78 URL to HTTPS. Next end-to-end test must use exact `home` from the other number; no replay or outbound message sent by the agent.

## Deployment completed with user authorization

User explicitly authorized deployment. Deployed runtime modules for normal/quoted auto-reply webhook sender resolution; isolated TypeScript build and regression tests passed. Production baseline checked before promotion. Service restarted successfully; health endpoint returned HTTP 200, WhatsApp/dispatch flags preserved, Telegram process PID and Next.js build preserved. Staging removed. Backup: /home/jeblast/backups/doran-webhook-sender-1792094208.

Changed rule 78 URL from http://dorun.id/api/check_user_by_phone to https://dorun.id/api/check_user_by_phone using a conditional update. Previous row saved at the backup directory/rule-78-before.json, mode 0600. Rule remains active, GET, inbox logging enabled. Production module tested against the device's actual stored mapping and resolved LID 278313914388723 to 6285231194683. At 2026-10-16 02:57:14 WIB the device was OPEN, online, active, and autoReplyEnabled.

Awaiting a fresh exact `home` message from the user to confirm actual outgoing webhook payload and Dorun response. No test WhatsApp message or manual webhook replay sent by the agent.

## Live incoming-to-reply verification succeeded

After deployment, InboxMessage 37377 recorded `Bebas ya` from 6285231194683 at 2026-10-16 02:57:31 WIB. URL HTTPS, GET. Dorun returned result true / Get Data and a successful Jeblast send-message queued result. Dispatch 9f37f8b8-6927-4358-b49e-94567d71db27 sent to 6285231194683 in one attempt at 02:57:35 WIB, delivered and READ, lastError null. Thus the real incoming WhatsApp -> HTTPS Dorun webhook -> Dorun send-message callback -> delivered/read WhatsApp reply path is confirmed. The latest completed inbox query at 02:58:08 WIB did not yet show a separate exact `home` message; do not attribute this successful result to `home`.
