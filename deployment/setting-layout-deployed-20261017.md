# Device setting layout — 17 Oktober 2026

Active: https://dashboard.jeblast.com/en/dashboard/phone

Edit/add device and device-policy modals now share setting rows: clickable label and help on the left, accessible switch and separate state on the right. Related conditional numeric inputs sit directly below their parent setting. Both modals have a bordered, rounded layout, scrollable body, and separate consistent Cancel/Save footer. Existing field visibility, initial values, validation and save semantics are preserved. No catalog changes; existing translated strings reused.

Four files deployed: SettingToggle.tsx, PhoneFormModal.tsx, PhonePolicyControls.tsx and globals.css.

Validation: isolated production build passed. ESLint has only the pre-existing effect dependency warning in PhoneFormModal. Authenticated admin/user checks passed on local and public HTTPS. Browser tests verified label click toggles state, conditional quota and minimum interval inputs, desktop/mobile modal width, and both submit payloads. Browser intercepted all modifying API requests; no device changes reached production. Desktop and mobile screenshots of both forms visually inspected.

Build: u5T4PP8YskkT7B18IPZN4
Backup: /home/jeblast/backups/doran-setting-layout-1792250307
Log: setting-layout-deploy-20261017.log
Screenshots: output/device-settings-edit-desktop-20261017.png, output/device-settings-edit-mobile-20261017.png, output/device-settings-limit-desktop-20261017.png, output/device-settings-limit-mobile-20261017.png.
Application online, WhatsApp and dispatch enabled, Telegram PID unchanged.
