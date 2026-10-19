# Device API URL parity

Local implementation, not deployed. No real WhatsApp messages were sent.

Each device API below supports both `/api/<action>` and `/api/public/<action>` using the same handler, response body, HTTP status and validation:

- send-message (GET/POST, HTTP 200 on success, dry_run supported)
- v2/send-message (same as send-message)
- send-status (GET/POST)
- send-media, send-poll, send-sticker, send-button, send-list, send-location, send-vcard (GET/POST, HTTP 202 on enqueue)
- session, disconnect, check-number, generate-qr (GET/POST)
- list-phones, phone-detail (GET/POST)
- send-group-message (POST)
- send-attachment (POST multipart/form-data, body parser disabled on both routes)

Token resolution is shared: Bearer header first, then `api_key` in body/form-data, then `api_key` in query. Only scalar nonempty strings up to 256 characters are accepted. Tokens remain device tokens; dashboard, media, account and admin endpoints retain their user authentication and ownership checks.

Public send-message now uses the existing main send-message handler: successful enqueue returns HTTP 200, invalid token returns HTTP 200 with `result:false`, and dry_run performs validation without enqueueing. This also retains the main handler's direct-send fallback when the queue is disabled.

Verification: `node deployment/verify-send-response.cjs` uses an in-memory database and forbids real transport. TypeScript, ESLint and API toolkit checks run locally. The API catalogue and Postman JSON examples were updated; the previously exported PDF guide has not been regenerated.
