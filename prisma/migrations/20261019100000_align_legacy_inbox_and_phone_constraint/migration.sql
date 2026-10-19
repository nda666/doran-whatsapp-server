-- Preserve the legacy production retry column and nullable sentAt on new installs.
-- Existing production already has retry: never drop or overwrite its values.
SET @doran_has_retry = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'inbox_messages' AND COLUMN_NAME = 'retry');
SET @doran_retry_sql = IF(@doran_has_retry = 0,
  'ALTER TABLE `inbox_messages` ADD COLUMN `retry` TINYINT NULL DEFAULT 0', 'SELECT 1');
PREPARE doran_legacy_retry FROM @doran_retry_sql;
EXECUTE doran_legacy_retry;
DEALLOCATE PREPARE doran_legacy_retry;

ALTER TABLE `inbox_messages` MODIFY `sentAt` DATETIME(3) NULL;

-- NO ACTION and RESTRICT both reject referenced-user deletion on MySQL/InnoDB.
-- Match the exact existing production metadata without changing cascade behavior.
ALTER TABLE `phones` DROP FOREIGN KEY `phones_userId_fkey`;
ALTER TABLE `phones` ADD CONSTRAINT `phones_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE NO ACTION ON UPDATE CASCADE;
