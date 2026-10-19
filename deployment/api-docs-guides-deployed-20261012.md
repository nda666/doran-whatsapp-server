# API supporting guides — 12 October 2026

Reorganized the Postman/PDF guide, authentication/request/error accordion and language-example configuration into titled rows with sentence-level bullet points. Also applied the same presentation to job ID, delivery/retry and registered-device guides. Original documentation, code markup, download URLs and dynamic environment selection are retained. The dry-run warning stays visible with a short bulleted description. A shared ApiGuideNotes component replaces the prior webhook-only helper and keeps the existing responsive styling.

Validation: source-only TypeScript, changed-source ESLint and isolated Linux production build passed. React/Ant Design preview checked all guides at desktop and 390px without horizontal overflow. Authenticated HTTPS HTML/JavaScript checks passed. Live browser confirmed the requested guide headings/content, preserved all three download URLs, switched to Python successfully, and found no page overflow. No sending or webhook operations executed.

Build: `akV6rotdBrBrvjw2_PC7M`.
Backup: `/home/jeblast/backups/doran-api-docs-guides-1791764955`.
Deployment script: `deployment/deploy-api-docs-guides-20261012.py`.
Screenshot: `deployment/api-docs-guides-live-20261012.png`.

Only doran-whatsapp restarted. Telegram PID and production WhatsApp/dispatch flags were verified preserved. No database or dependency change.
