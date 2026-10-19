# Saved incoming messages and conversations

Deployed 16 October 2026 (Asia/Jakarta).

## Behavior

- Add/edit device forms expose Simpan Pesan Masuk. It defaults to false; existing devices remain opted out. All 61 production devices were unchanged by rollout and none were automatically enabled.
- The new Percakapan menu is available at `/dashboard/conversations`; device actions include Lihat Percakapan. Users select a device, search contacts/message contents, view unread counts, read paginated history, archive/unarchive, and reply to a specific saved message.
- Messages refresh every three seconds. The layout supports a conversation list and message pane, with a back button at narrow widths. Times are explicitly displayed in WIB.
- Text and common image/video/audio/document/sticker messages are stored separately from existing webhook logs. Incoming/outgoing message IDs are deduplicated per conversation. Native sends and automatic replies use the existing socket wrapper to populate outgoing history. Acknowledgements update sent/delivered/read status monotonically.
- Both live and reconnect/offline message events are captured. Activation timestamps exclude messages predating activation. LID aliases use available phone-number mappings to keep the same customer's conversation together.
- Replying uses the selected device's existing authenticated WhatsApp socket, supports text, quoted text, and attachments from the existing upload endpoint (25 MB maximum). Offline, disabled, and maintenance devices reject new sends. Idempotent request IDs prevent repeated clicks or HTTP retries from sending twice. Ambiguous transport outcomes are shown without an automatic resend.
- Media downloads require authenticated owner/admin access and support HTTP byte ranges. Paths are validated; unsafe media types download as files. View-once content remains a placeholder. Failed/oversized media downloads retain a text notice.
- Phone cleanup removes saved conversations and their files when history/device removal is selected; settings reset disables capture. Incoming saving remains independent of automatic replies.

## Validation

- Local TypeScript checks and targeted lint passed (the shared form's existing effect-dependency warning remains).
- Focused regressions passed for activation gating, pre-activation exclusion, LID mapping, deduplication, unread behavior, media cleanup, monotonic receipts, ownership, offline rejection, idempotent/concurrent replies, ambiguous transport, input validation, and protected metadata.
- Existing phone defaults/cleanup, recovery, auto-reply typing/control/status/form, keyword, device-webhook, connection, registration, and user-status regressions passed in the isolated build.
- Built API checks passed on an isolated Next server before promotion and on production afterward: signed-session access, opt-in capture, duplicates, outgoing history, owner isolation/404s, unauthenticated rejection, archive, unread marking, history pagination, protected media/range responses, and offline send rejection. Disposable users/devices/files were removed and absence verified.
- Chrome verified the new menu, the add-device switch, and message bubbles/outgoing status/quotes using an inactive example device; that fixture was removed. No customer messages were sent; actual WhatsApp delivery was not tested against a real recipient.
- WhatsApp and Telegram processes online; WhatsApp/dispatch flags remain true; Telegram PID unchanged. Sign-in returns HTTP 200. Staging cleanup, backup success, and 61 retained devices verified.

## Deployment

Build: `ZZpC6cMvO8OaiF4M-DMLu`.
Backup: `/home/jeblast/backups/doran-conversations-1792109767`.
Log: `/home/jeblast/conversations-deploy-20261016.log`.
Migrations: `20261016090000_conversations`, `20261016100000_chat_capture_since`.

Migrations only add the opt-in flag/activation date and chat tables. Generated Prisma client was backed up before generation. Runtime promotion has automatic rollback; additive schema is retained if runtime rollback is required. Staging API verification runs without the custom server's WhatsApp or queue workers.
