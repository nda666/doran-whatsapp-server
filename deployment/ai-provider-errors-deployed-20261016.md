# AI provider error handling — deployed 16 October 2026

Production: https://dashboard.jeblast.com
Build: `0u_msf2B0BAKiMqkKSYmg`
Rollback backup: `/home/jeblast/backups/doran-ai-provider-errors-1792158254`

Provider HTTP 503/529 now records `AI_PROVIDER_BUSY`, with an Indonesian message asking the user to wait about one minute. Other provider HTTP 5xx records `AI_PROVIDER_UNAVAILABLE`. Quota errors remain distinct. No automatic provider retries were added.

The test API returns HTTP 422 for known upstream failures, preserving a safe application message and error code instead of returning a gateway status that the edge replaces. Authentication/account/input/quota statuses remain as before. The dashboard also has specific connection/timeout and gateway fallback messages. No provider response bodies or credentials are exposed.

Validation: offline provider/error-route regression tests (503, 529, 500, 429, 403, 404); existing templates/AI behavior suite; TypeScript check; isolated production build; authenticated staging and production API checks with disposable fixtures and no external AI/WhatsApp calls; all PM2 processes online; public HTTP 200 and matching build ID; regression suite rerun on installed production source. Deployment detects baseline drift and can roll back failed promotion. The isolated stage was removed after success.

This fixes error reporting; temporary Gemini capacity shortages remain controlled by Google. No additional live Gemini generation was used to validate this change.
