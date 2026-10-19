# API Docs layout — 12 October 2026

Deployed shared responsive code panels across all 30 API operations and the five-language integration examples at https://dashboard.jeblast.com/dashboard/api-docs. Endpoint headers separate method badges, paths and titles. Request/response panels share consistent spacing, borders, typography and integrated copy controls. Desktop uses two columns, smaller viewports stack panels. Long paths, code and dropdown selections wrap within their containers. API payloads, authentication and endpoint behavior are unchanged.

Validation: source-only TypeScript and changed-file ESLint passed. Actual React/Ant Design server-rendered preview covered all 30 operations and 268 expanded code panels at desktop and 390px without page/panel overflow. Isolated Linux Next.js and server TypeScript production build passed. Authenticated public HTTPS HTML/JavaScript verification passed. Live browser expanded all 30 operations and confirmed 30 request panels with no horizontal overflow, checked the mobile endpoint view and Python tab, and observed the successful copy toast. Browser clipboard inspection returned an empty value, so exact clipboard-content equality was not verified. No API send requests were executed.

Build ID: `5BCjkJZODf1Om7zmidTKe`.
Rollback backup: `/home/jeblast/backups/doran-api-docs-layout-1791744979` (prior source and runtime).
Deployment script: `deployment/deploy-api-docs-layout-20261012.py`.
Only `doran-whatsapp` restarted; deployment verified `telegram-sender` retained its PID, and production WhatsApp/dispatch flags remained enabled. No database migration or dependency change.

Screenshot: `deployment/api-docs-layout-live-20261012.png`.
