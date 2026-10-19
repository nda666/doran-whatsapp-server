-- Historical recovery only: superseded by migration
-- 20261019100000_align_legacy_inbox_and_phone_constraint. Do not run this
-- after the current migration chain (retry already exists).
-- Recovery only: run AFTER the pre-20261019 migrations on an empty database.
-- Do not run this on the existing production database: it already has these changes.
-- These legacy changes were found in the production structure but not in migration history.
ALTER TABLE `inbox_messages`
    ADD COLUMN `retry` TINYINT NULL DEFAULT 0,
    MODIFY `sentAt` DATETIME(3) NULL;
