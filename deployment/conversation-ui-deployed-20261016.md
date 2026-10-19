# Conversation scroll and message menu

Deployed 16 October 2026 (Asia/Jakarta).

Polling and receipt/status changes no longer trigger a scroll. The panel tracks seen message IDs and scrolls on initial opening or new messages while near the bottom. Reading older history retains the current position. Prepending history preserves its scroll anchor. A new outgoing message scrolls after rendering; checking a previously known send does not.

Replaced the always-visible Balas button with a small downward chevron at the top-right of each message. It appears on hover/focus and remains visible on touch devices. The menu contains Balas, Salin teks when text is present, and Unduh lampiran when an attachment is present. Reply remains disabled for offline/nonactive devices. Download requests explicitly set attachment disposition while retaining authenticated ownership checks.

Validation: scoped frontend TypeScript and targeted lint passed. Isolated production build, existing regressions, and authenticated staging/production API checks passed, including inline-versus-download media response headers. Chrome verified the chevron/menu options with a temporary inactive device. Scroll position remained 4235.56px through multiple polls and a status-only change, with a 48.44px bottom gap. Adding a new test message advanced to the bottom (1.33px fractional zoom gap). All example devices/messages/files and API fixtures were removed. No WhatsApp messages were sent.

Build: `nVnt1ZAMQEAZ5asWg-Szf`.
Backup: `/home/jeblast/backups/doran-conversation-ui-1792111017`.
Log: `/home/jeblast/conversation-ui-deploy-20261016.log`.
