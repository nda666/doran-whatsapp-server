# User ID in device actions — 11 October 2026

Deployed build `AAFzXb6V-jpIJ6n6UHBKL` to /dashboard/phone.
Backup: `/home/jeblast/backups/doran-phone-user-id-1791732826`.

Added Aksi → Lihat User ID. The dialog shows the device name, sender number, owner name when available, and copyable phone.userId, with guidance to use it as dispatch.user_id. Existing phone API ownership scope supplies this field; no API or permission changes were needed.

Validation: ESLint, isolated Next.js/server production build, authenticated live page/shared chunks, and owner UUID from the existing phones API. Browser verification on DG Sidoarjo confirmed the menu, actual owner UUID and User ID tersalin success indicator. Clipboard connector reads did not reflect native browser copy, so the UI success indicator was used. Screenshot: output/phone-user-id-live.jpg. No WhatsApp message, token generation or webhook request was performed. Telegram process unchanged; existing WhatsApp/dispatch enabled states preserved.
