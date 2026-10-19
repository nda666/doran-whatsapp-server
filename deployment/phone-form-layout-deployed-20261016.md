# Device form visibility modal layout

Deployed 16 October 2026 (Asia/Jakarta).

The visibility editor now has a dedicated title, six selectable cards in a responsive two-column grid, concise descriptions, selection count, select-all/hide-all actions, a brief informational note and a separate footer with Cancel/Save. Existing label/key metadata remains in the form but is hidden for this specific built-in setting. Other global setting editors retain their current fields. The footer stays outside the scrolling form body on short screens.

Validation: isolated production build and existing regressions passed. Browser inspection confirmed the final layout and fully visible footer; select-all and hide-all displayed 6/6 and 0/6 respectively. Cancel and reopen restored the existing 3/6 selection without saving any setting change. Screenshot: `output/phone-form-layout-20261016.png`.

Build: `Zhe6pYkj5VkvxJFIxAbiZ`.
Backup: `/home/jeblast/backups/doran-phone-form-layout-1792128109`.
Log: `/home/jeblast/phone-form-layout-deploy-20261016.log`.
