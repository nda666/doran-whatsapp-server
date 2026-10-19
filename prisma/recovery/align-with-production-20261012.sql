-- Recovery only: run AFTER all migrations on a newly created empty database.
-- Do not run this on the existing production database: it already has these changes.
-- These legacy changes were found in the production structure but not in migration history.
ALTER TABLE `inbox_messages`
    ADD COLUMN `retry` TINYINT NULL DEFAULT 0,
    MODIFY `sentAt` DATETIME(3) NULL;
