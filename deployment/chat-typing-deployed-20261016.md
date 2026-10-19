# Live typing from conversation drafts

Deployed 16 October 2026 (Asia/Jakarta).

Typing into the conversation composer now sends WhatsApp composing presence immediately and refreshes it at most every four seconds while input continues. Three seconds without input, clearing the draft, input/window blur, hidden page, send, or leaving the conversation sends paused presence. Requests are serialized per composer to preserve start/stop order. The backend expires lost heartbeats after eight seconds and tracks separate tabs/operators so one tab's pause does not stop another active tab.

The authenticated typing API scopes both conversation and phone ownership. It respects showTyping, saveIncomingMessages, device activation, socket readiness, and maintenance state. It transmits presence only, without sending message text or adding chat history.

Validation: frontend/server TypeScript checks, targeted lint, focused timing/multi-tab/access regressions, existing conversation regressions, isolated production build, and isolated authenticated API checks passed. Production API checks passed after promotion. Served browser assets contain the typing lifecycle. The requested device has showTyping=true, saveIncomingMessages=true, active=1, isOnline=true. WhatsApp and Telegram processes online; Telegram PID unchanged. All temporary test records removed. No messages or live test typing were sent to real recipients; recipient-screen rendering was not directly observed.

The first build stopped safely in staging on an ES5 Map-iterator incompatibility; corrected using Map.forEach before successful deployment. No schema changes were required.

Build: `q3NzCTNZ8kHiuxcQkdNl6`.
Backup: `/home/jeblast/backups/doran-chat-typing-1792110444`.
Log: `/home/jeblast/chat-typing-deploy-20261016.log`.
