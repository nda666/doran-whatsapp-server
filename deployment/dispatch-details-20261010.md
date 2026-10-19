Deployed 10 October 2026 to https://dashboard.jeblast.com/dashboard/dispatch.

QUEUED is displayed as Menunggu pengiriman with a per-row explanation derived from campaign schedule/pause, sender active/connection state, media preparation retry or queue timing. Error codes are translated into readable Indonesian. Store default is displayed as Store tidak ditentukan; message_key default as Umum. Tooltips explain the original values and transaction ID tracking/deduplication purpose.

Each row has a fixed Lihat pesan button. GET /api/dispatch?id=... loads the stored recipient message on demand under the existing authenticated owner scope. It returns text, image reference, typed payload and attachment metadata, excluding internal lease/dedupe fields. The dialog preserves text line breaks and renders polling, location, contact, button/list and sticker details. Cleared content shows the existing 7-day/30-day retention policy. Queue status remains the delivery authority; previewing stored content does not imply it was sent.

Explicit column widths and horizontal scrolling preserve readable IDs and waiting explanations. The action remains visible while scrolling.

Validation passed: TypeScript, ESLint, production Next/server build, mocked waiting-reason/detail ownership/retention checks, authenticated read-only public pages/APIs, detail content comparison against the stored database message, anonymous rejection and unknown-ID rejection. Chrome verified the updated table and opened a stored message through Lihat pesan. No test WhatsApp message sent. All 68 devices preserved, 65 active and 16 online in post-deploy checks; Telegram PID unchanged.

Backups: /home/jeblast/backups/doran-dispatch-details-20261010 (feature release) and /home/jeblast/backups/doran-dispatch-details-layout-20261010 (column layout follow-up). Each contains prior source, changed-source-before/existing-files.json and previous-runtime. No migration was required. Runtime deployment and layout follow-up were each explicitly approved by the user after automatic approval review required authorization for each restart.
