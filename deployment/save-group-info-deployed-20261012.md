# Save Group information — 12 October 2026

Deployed build `2j128Ij_q0ApjHd3e9HoN` to `/dashboard/phone`.
Backup: `/home/jeblast/backups/doran-save-group-info-1791743962`.

Added a visible information panel above the devices table describing On/Off, the saved group metadata and participants, and incoming group messages as the trigger. It clarifies that enabling the setting does not immediately import every group, back up chat history, or send blasts.

Validation: ESLint passed with two existing hook dependency warnings; isolated Next.js/server production build passed; authenticated live HTML and bundle verification passed. Chrome verification confirmed the panel and readable layout. Screenshot: `output/save-group-info-live.jpg`.

The deployment preserved the Telegram process and enabled WhatsApp/dispatch flags. No device settings were changed during browser verification.
