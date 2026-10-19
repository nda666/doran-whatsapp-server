# Device ID in device actions — 11 October 2026

Deployed build `dmRVOVq2TAr6rodi78JVm` to /dashboard/phone.
Backup: `/home/jeblast/backups/doran-phone-device-id-1791733811`.

Added Aksi → Lihat Device ID with copyable phone.id and mapping to dispatch.device_id / phone-detail data[].id. Existing User ID action remains available. No API or permission changes.

Validation: ESLint, isolated production build, authenticated page/shared chunk verification. Browser confirmed DG Sidoarjo device ID `3d8feefe-c6f9-4dee-8563-66b1dd37e9b5` and Device ID tersalin indicator. Screenshot: output/phone-device-id-live.jpg. No webhook, WhatsApp message or token regeneration performed. Telegram unchanged, WhatsApp/dispatch enabled states preserved.
