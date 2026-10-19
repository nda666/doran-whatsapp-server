# Global device form visibility

Deployed 16 October 2026 (Asia/Jakarta).

Admin → Pengaturan Global → Input tambahan form perangkat now offers six checkboxes controlling visibility in both add and edit device forms for every user. All six are initially visible. Empty selection is supported. Hidden values are omitted on submit, preserving existing device settings and API creation defaults. Visibility reloads when the modal opens; loading failures block save and offer retry. This is form visibility, not an API permission policy.

The setting is stored encrypted using existing global settings infrastructure; admin writes validate allowed unique field names. An authenticated endpoint exposes only this field list. No schema migration required. All devices retain readReceipt=false and showTyping=false from the previous task.

Validation: focused regression covers empty/subset/default selection, malformed values, endpoint methods and hidden-value preservation; isolated production build and existing regressions passed. Live verification confirmed setting initialization, encrypted storage, authenticated reads, normal-user admin restriction, invalid-update rejection, and zero devices with receipt/typing enabled. Existing process health checks and staging cleanup passed.

Build: `owzS-JXjmZrmCXg1bWoyt`.
Backup: `/home/jeblast/backups/doran-phone-form-fields-1792127784`.
Log: `/home/jeblast/phone-form-fields-deploy-20261016.log`.
