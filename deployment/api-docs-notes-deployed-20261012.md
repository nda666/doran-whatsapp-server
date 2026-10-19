# Structured API descriptions — 12 October 2026

Replaced the dense notes paragraph for all 30 API operations with titled sections and individual bullet points: usage/response, authentication/access, parameters/limits, request IDs/retry, delivery status/webhooks, dry run, URL/errors, and endpoint aliases. Only relevant sections appear. Field names and API paths have inline code formatting. The language examples use the same notes component. Desktop sections align labels and lists in columns; mobile stacks labels above lists.

Every original sentence is retained without rewriting API contracts. A catalogue-wide preservation check passed for all 30 operations. Source-only TypeScript and changed-source ESLint passed, as did the isolated Linux production Next.js/server TypeScript build and authenticated public HTML/JavaScript verification. Browser preview covered all 30 operations and the shared language example at desktop and 390px without overflow. Live browser confirmed 30 rendered notes panels without horizontal overflow and visually checked the user-reported send-message description.

Build: `oXjWTyK-QCMuj04YJ3J5T`.
Backup: `/home/jeblast/backups/doran-api-docs-notes-1791763103`.
Script: `deployment/deploy-api-docs-notes-20261012.py`.
Screenshot: `deployment/api-docs-notes-live-20261012.png`.

Only doran-whatsapp restarted. Telegram PID, WhatsApp and dispatch flags were verified unchanged. No API messages sent, database migration, or dependency change.
