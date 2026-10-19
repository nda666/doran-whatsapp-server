# Jump to latest message

Deployed 16 October 2026 (Asia/Jakarta).

Added a floating 46px circular down-arrow button, horizontally centered near the bottom of the chat message viewport. It appears when more than 80px from the bottom, scrolls smoothly to the latest message, and disappears upon arrival. Styling uses the current surface color, green icon, soft shadow, subtle entrance/hover effects, visible keyboard focus, and reduced-motion support. Existing scroll preservation remains intact.

Validation: frontend TypeScript, targeted lint, isolated production build and existing regression/API checks passed. Chrome verified hidden-at-bottom, visible-after-scroll, centered placement (0.006px center offset), button click returning to bottom (0.7px fractional zoom gap), and hiding after arrival. After scrolling up again, the button remained visible through multiple polls and the reading position stayed away from the bottom. Temporary inactive test device/messages/file removed; no WhatsApp messages sent. Served browser asset, process health, backup success, and staging cleanup verified.

Build: `uNfAXe0bmrDk9d7CnyYAm`.
Backup: `/home/jeblast/backups/doran-chat-scroll-latest-1792111705`.
Log: `/home/jeblast/chat-scroll-latest-deploy-20261016.log`.
