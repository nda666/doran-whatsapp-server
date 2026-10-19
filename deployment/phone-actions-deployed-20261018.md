# Perangkat WhatsApp: ghost buttons and Save Group border

Deployed on 18 October 2026 to https://dashboard.jeblast.com/dashboard/phone.

Build: `TE4BlwRczWo8VVWBsUQUd`.
Backup: `/home/jeblast/backups/doran-phone-actions-1792284558`.
Deployment log: `phone-actions-deploy-20261018.log`.
HTTP verification log: `phone-actions-verify-20261018.log`.

Two files changed: `src/pages/dashboard/phone.tsx` and `src/styles/globals.css`.
Ghost actions now have a visible themed border and hover state. All action buttons
use 40px height, 16px horizontal padding, 10px radius and 12px gap. Disabled buttons
use opacity .45, not-allowed cursor and matching hover/active appearance. Save Group
uses a 1px themed border with 16px radius; its existing info background is retained.
Source comments explain each change. No sidebar or language selector edits.

TypeScript passed. Targeted lint passed with the existing useEffect dependency
warning at phone.tsx:172. Isolated production build and source manifest checks passed.
Application online; WhatsApp and dispatch enabled; Telegram PID unchanged.
Public authenticated page, session and CSS assets returned HTTP 200 and serve the
expected build ID.

Headless Chrome checks passed for all six color options in light and dark modes:
button heights/padding/radius/gap, ghost hover, unchanged disabled hover, disabled
cursor/opacity, and Save Group border/radius. Mobile checks at 390px passed for
button heights and no action-toolbar overflow. Screenshots are saved under
`output/phone-actions-desktop-20261018.png` and
`output/phone-actions-mobile-20261018.png`.
