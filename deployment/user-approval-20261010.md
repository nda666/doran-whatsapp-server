User registration and ownership isolation deployed on 2026-10-10.

Public `/signup` and `/api/signup` create USER accounts with PENDING approval. `/api/regis` uses the same handler. Pending and rejected accounts cannot authenticate or access authenticated APIs or Socket.IO. Admin Panel → Manage Users supports status filtering, approval, rejection, and manual account creation; manually created accounts are APPROVED immediately.

Only the approved ADMIN account `admin@gmail.com` has unrestricted data access and device capacity. Other accounts, including other ADMIN accounts, see their own devices, contacts, groups, media, campaigns, dispatch queue, history, logs, search results, statistics, exports, and reports. Admin management routes remain role protected. Device actions and downloaded media enforce the same owner scope. Real-time device events go to the owning user's room and the designated super admin room.

Migration `20261010070000_user_approval` adds a status column with APPROVED as the default to preserve existing accounts. Public registration explicitly overrides this to PENDING. Existing devices and runtime sessions remain intact.

Validation: TypeScript and targeted lint passed; production Next.js/server build passed. `verify-user-approval.cjs` ran against staging on 3018 with WhatsApp and dispatch disabled. It checked public registration, injected-role rejection, manual creation, admin approval/rejection, session and socket approval checks, two-owner data isolation, cross-owner mutation denial, exports and aggregate statistics. Synthetic devices were inactive and jobs terminal FAILED; no messages were sent. Three test accounts and their fixtures were removed in finally.

`verify-user-approval-live.cjs` verified the public signup link and page, registration, pending NextAuth credential rejection, admin approval, successful credential login, session identity, and empty device list for a new user. Its temporary account was removed. Live read-only checks passed for all dashboard pages and relevant APIs; no migrations remain pending. Production retained 68 devices, WhatsApp and dispatch flags, and the telegram-sender PID.

Backup: `/home/jeblast/backups/doran-user-approval-20261010` contains the pre-migration database dump, source snapshot, changed-source snapshot, and previous build/dependencies. Rollback retains the additive database column; it refuses to restore legacy authentication if unapproved accounts exist.
