# Webhook documentation layout — 12 October 2026

Reorganized both API Docs webhook cards into six titled rows with short bullet points. Delivery-status documentation separates configuration, events/triggers, payload, request/authentication, receiver/retry requirements, and webhook tests. Device documentation separates configuration, events/triggers, payload, request/authentication, receiver/retry requirements, and synchronization/scope. Existing contracts and all details are preserved. Uses the existing responsive documentation styles; no backend change.

Validation: source-only TypeScript and page ESLint passed. React/Ant Design preview confirmed both six-section cards at desktop and 390px without horizontal overflow. Isolated Linux production Next.js/server build and authenticated HTTPS HTML/JavaScript checks passed. Live browser confirmed all twelve section headings and no page overflow.

Build ID: `7KCMbrHJIGRcw-49P0_os`.
Backup: `/home/jeblast/backups/doran-api-docs-webhook-notes-1791764519`.
Deployment: `deployment/deploy-api-docs-webhook-notes-20261012.py`.
Screenshot: `deployment/api-docs-webhook-notes-live-20261012.png`.

Only doran-whatsapp restarted; Telegram PID and production WhatsApp/dispatch flags were verified preserved. No real webhook or WhatsApp test event was sent, and no database or dependency changes were made.
