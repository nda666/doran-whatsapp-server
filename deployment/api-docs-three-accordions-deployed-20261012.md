# API Docs collapsible sections — 12 October 2026

Converted the Postman/PDF downloads, delivery-status webhook and device webhook cards to Ant Design Collapse items. Each starts collapsed, can be expanded/closed independently, and retains its existing content and links. Delivery and device webhooks share one Collapse container without exclusive accordion mode.

Source-only TypeScript, page ESLint, isolated Linux Next.js/server production build and authenticated HTTPS HTML/JS checks passed. Live browser verified all three collapsed initially, each content visible on expansion and hidden after closing, and Enter keyboard toggling. No webhook or WhatsApp operation executed.

Build: `FM-XYtiv4iS5B3TjDKBMc`.
Backup: `/home/jeblast/backups/doran-api-docs-three-accordions-1791765433`.
Script: `deployment/deploy-api-docs-three-accordions-20261012.py`.
Screenshot: `deployment/api-docs-three-accordions-live-20261012.png`.

Only doran-whatsapp restarted. Telegram PID and production WhatsApp/dispatch flags were verified preserved. No database or dependency changes.
